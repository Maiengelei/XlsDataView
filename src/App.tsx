import { useEffect, useMemo, useState } from 'react';
import DropZone from './components/DropZone';
import FilterPanel from './components/FilterPanel';
import MultiSeriesChart, {
  type BarOrientation,
  type MultiChartType
} from './components/MultiSeriesChart';
import SearchableMultiSelect from './components/SearchableMultiSelect';
import SearchableSelect, { type SelectOption } from './components/SearchableSelect';
import { exportSeriesToXlsx } from './lib/export';
import { applyFilters } from './lib/filter';
import { clearAllData, clearSeriesData, getSeriesRows, listSeriesMeta, syncSeriesData } from './lib/sync';
import { parseXlsFile } from './lib/xls';
import type { FilterCondition, ImportStats, ParsedSheet, RowData, SeriesMeta } from './types';

const MAX_RENDER_ROWS = 500;
const ALL_GROUP_VALUE = 'ALL';

type AppPage = 'results' | 'import' | 'settings';
type ImportMode = 'snapshot' | 'append';
type NumericAggregateMode = 'sum' | 'max' | 'min' | 'avg' | 'first' | 'last';
type TextAggregateMode = 'first' | 'last' | 'uniqueJoin';

interface CompareGroup {
  id: string;
  values: Record<string, string>;
}

interface CompareResultRow {
  groupLabel: string;
  matchedCount: number;
  values: Record<string, string | number>;
}

interface CompareResultData {
  infoColumns: string[];
  rows: CompareResultRow[];
}

const PAGE_HASH: Record<AppPage, string> = {
  results: '#/results',
  import: '#/import',
  settings: '#/settings'
};

function pageFromHash(hash: string): AppPage {
  if (hash === PAGE_HASH.import) {
    return 'import';
  }

  if (hash === PAGE_HASH.settings) {
    return 'settings';
  }

  return 'results';
}

function formatTime(time: number): string {
  return new Date(time).toLocaleString();
}

function asNumber(value: string): number | null {
  const text = value.trim();
  if (!text) {
    return null;
  }

  const parsed = Number(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatMetric(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2);
}

function formatCompareValue(value: string | number): string {
  if (typeof value === 'number') {
    return formatMetric(value);
  }

  const text = value.trim();
  return text ? text : '-';
}

function uniqueValues(rows: RowData[], column: string): string[] {
  if (!column) {
    return [];
  }

  return Array.from(
    new Set(
      rows
        .map((row) => String(row[column] ?? '').trim())
        .filter((value) => value !== '')
    )
  ).sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function summarizeColumn(
  rows: RowData[],
  column: string,
  numericMode: NumericAggregateMode,
  textMode: TextAggregateMode
): string | number {
  const values = rows
    .map((row) => String(row[column] ?? '').trim())
    .filter((value) => value !== '');

  if (values.length === 0) {
    return '';
  }

  const parsed = values.map((value) => asNumber(value));
  const allNumeric = parsed.every((value) => value !== null);

  if (allNumeric) {
    const numericValues = parsed.map((value) => value ?? 0);

    if (numericValues.length === 1) {
      return numericValues[0];
    }

    switch (numericMode) {
      case 'max':
        return Math.max(...numericValues);
      case 'min':
        return Math.min(...numericValues);
      case 'avg':
        return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
      case 'first':
        return numericValues[0];
      case 'last':
        return numericValues[numericValues.length - 1];
      case 'sum':
      default:
        return numericValues.reduce((sum, value) => sum + value, 0);
    }
  }

  if (values.length === 1) {
    return values[0];
  }

  switch (textMode) {
    case 'last':
      return values[values.length - 1];
    case 'uniqueJoin': {
      const distinct = Array.from(new Set(values));
      const preview = distinct.slice(0, 5).join(' / ');
      return distinct.length > 5 ? `${preview} ...(${distinct.length}项)` : preview;
    }
    case 'first':
    default:
      return values[0];
  }
}

function toOptions(values: string[]): SelectOption[] {
  return values.map((value) => ({ value, label: value }));
}

function normalizeGroupValues(values: Record<string, string>, columns: string[]): Record<string, string> {
  const next: Record<string, string> = {};

  columns.forEach((column) => {
    next[column] = values[column] ?? '';
  });

  return next;
}

function newGroup(columns: string[]): CompareGroup {
  const values: Record<string, string> = {};

  columns.forEach((column) => {
    values[column] = '';
  });

  return {
    id: crypto.randomUUID(),
    values
  };
}

function makeGroupLabel(group: CompareGroup, groupColumns: string[]): string {
  return groupColumns.map((column) => `${column}: ${group.values[column] ?? ''}`).join(' | ');
}

function isAllGroupValue(value: string): boolean {
  return value.trim().toUpperCase() === ALL_GROUP_VALUE;
}

function modeLabel(mode: SeriesMeta['keyMode']): string {
  if (mode === 'append') {
    return '增量追加（整行去重）';
  }

  if (mode === 'keyed') {
    return '键控更新';
  }

  return '整表覆盖（快照）';
}

export default function App(): JSX.Element {
  const [page, setPage] = useState<AppPage>(pageFromHash(window.location.hash));

  const [seriesList, setSeriesList] = useState<SeriesMeta[]>([]);
  const [selectedSeries, setSelectedSeries] = useState('');

  const [rows, setRows] = useState<RowData[]>([]);
  const [filters, setFilters] = useState<FilterCondition[]>([]);

  const [seriesInput, setSeriesInput] = useState('');
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [parsedFile, setParsedFile] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState('');

  const [stats, setStats] = useState<ImportStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportingSeries, setExportingSeries] = useState('');
  const [clearingSeries, setClearingSeries] = useState('');
  const [taskProgress, setTaskProgress] = useState(0);
  const [taskMessage, setTaskMessage] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [showSeriesMeta, setShowSeriesMeta] = useState(false);
  const [showRawData, setShowRawData] = useState(false);

  const [groupColumns, setGroupColumns] = useState<string[]>([]);
  const [compareInfoColumns, setCompareInfoColumns] = useState<string[]>([]);
  const [compareGroups, setCompareGroups] = useState<CompareGroup[]>([]);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState('');
  const [compareResult, setCompareResult] = useState<CompareResultData | null>(null);
  const [numericAggregateMode, setNumericAggregateMode] = useState<NumericAggregateMode>('sum');
  const [textAggregateMode, setTextAggregateMode] = useState<TextAggregateMode>('first');
  const [chartType, setChartType] = useState<MultiChartType>('bar');
  const [barOrientation, setBarOrientation] = useState<BarOrientation>('vertical');
  const [chartXAxisTitle, setChartXAxisTitle] = useState('数据组');
  const [chartYAxisTitle, setChartYAxisTitle] = useState('汇总值');
  const [chartColumns, setChartColumns] = useState<string[]>([]);

  const selectedMeta = useMemo(
    () => seriesList.find((item) => item.series === selectedSeries) ?? null,
    [selectedSeries, seriesList]
  );

  const viewHeaders = selectedMeta?.headers ?? [];
  const filteredRows = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const displayRows = useMemo(() => filteredRows.slice(0, MAX_RENDER_ROWS), [filteredRows]);

  const totalRowsInDb = useMemo(
    () => seriesList.reduce((sum, item) => sum + item.rowCount, 0),
    [seriesList]
  );

  const seriesOptions = useMemo(() => toOptions(seriesList.map((item) => item.series)), [seriesList]);
  const headerOptions = useMemo(() => toOptions(viewHeaders), [viewHeaders]);

  const infoColumnOptions = useMemo(
    () => toOptions(viewHeaders.filter((header) => !groupColumns.includes(header))),
    [viewHeaders, groupColumns]
  );

  const infoColumnsForComparison = useMemo(
    () =>
      compareInfoColumns.length > 0
        ? compareInfoColumns
        : viewHeaders.filter((header) => !groupColumns.includes(header)),
    [compareInfoColumns, viewHeaders, groupColumns]
  );

  const groupValueOptionsMap = useMemo(() => {
    const map: Record<string, string[]> = {};

    groupColumns.forEach((column) => {
      map[column] = uniqueValues(filteredRows, column);
    });

    return map;
  }, [groupColumns, filteredRows]);

  const chartableColumns = useMemo(() => {
    if (!compareResult) {
      return [];
    }

    return compareResult.infoColumns.filter((column) =>
      compareResult.rows.some((row) => typeof row.values[column] === 'number')
    );
  }, [compareResult]);

  const selectedChartColumns = useMemo(
    () =>
      chartColumns.length > 0
        ? chartColumns.filter((column) => chartableColumns.includes(column))
        : chartableColumns,
    [chartColumns, chartableColumns]
  );

  const chartCategories = useMemo(
    () => compareResult?.rows.map((row) => row.groupLabel) ?? [],
    [compareResult]
  );

  const chartSeries = useMemo(() => {
    if (!compareResult) {
      return [];
    }

    return selectedChartColumns.map((column) => ({
      name: column,
      values: compareResult.rows.map((row) => {
        const value = row.values[column];
        if (typeof value === 'number') {
          return value;
        }

        const parsed = asNumber(String(value ?? ''));
        return parsed ?? 0;
      })
    }));
  }, [compareResult, selectedChartColumns]);

  const refreshSeriesList = async (): Promise<void> => {
    const list = await listSeriesMeta();
    setSeriesList(list);
  };

  const loadSeriesRows = async (series: string): Promise<void> => {
    setLoading(true);

    try {
      const records = await getSeriesRows(series);
      setRows(records);
      setFilters([]);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '读取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const navigate = (nextPage: AppPage): void => {
    if (window.location.hash !== PAGE_HASH[nextPage]) {
      window.location.hash = PAGE_HASH[nextPage];
    }
    setPage(nextPage);
  };

  useEffect(() => {
    const onHashChange = (): void => setPage(pageFromHash(window.location.hash));

    window.addEventListener('hashchange', onHashChange);

    if (!window.location.hash) {
      window.location.hash = PAGE_HASH.results;
    }

    void refreshSeriesList();

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!selectedSeries) {
      setRows([]);
      return;
    }

    void loadSeriesRows(selectedSeries);
  }, [selectedSeries]);

  useEffect(() => {
    setGroupColumns((current) => current.filter((column) => viewHeaders.includes(column)));
    setCompareInfoColumns((current) => current.filter((column) => viewHeaders.includes(column)));
  }, [viewHeaders]);

  useEffect(() => {
    setCompareInfoColumns((current) => current.filter((column) => !groupColumns.includes(column)));

    setCompareGroups((current) => {
      if (groupColumns.length === 0) {
        return [];
      }

      if (current.length === 0) {
        return [newGroup(groupColumns)];
      }

      return current.map((group) => ({
        ...group,
        values: normalizeGroupValues(group.values, groupColumns)
      }));
    });
  }, [groupColumns]);

  useEffect(() => {
    setCompareResult(null);
    setCompareError('');
  }, [filteredRows, groupColumns, compareInfoColumns, compareGroups, numericAggregateMode, textAggregateMode]);

  useEffect(() => {
    setChartColumns((current) => current.filter((column) => chartableColumns.includes(column)));
  }, [chartableColumns]);

  const handleFileSelected = async (file: File): Promise<void> => {
    if (parsing || importing) {
      return;
    }

    setError('');
    setInfo('');
    setStats(null);
    setTaskProgress(0);
    setTaskMessage('准备解析文件...');
    setParsing(true);

    try {
      const parsed = await parseXlsFile(file, {
        onProgress: ({ progress, message }) => {
          setTaskProgress(progress);
          setTaskMessage(message);
        }
      });

      setParsedFile(parsed);
      setFileName(file.name);

      if (!seriesInput.trim()) {
        setSeriesInput(parsed.sheetName);
      }

      setTaskProgress(100);
      setTaskMessage('文件解析完成');
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : '解析文件失败');
      setParsedFile(null);
      setFileName('');
      setTaskProgress(0);
      setTaskMessage('');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async (): Promise<void> => {
    if (!parsedFile) {
      setError('请先导入文件');
      return;
    }

    const series = seriesInput.trim();
    if (!series) {
      setError('请输入系列名，用于区分不同数据表');
      return;
    }

    setImporting(true);
    setError('');
    setInfo('');
    setTaskProgress(0);
    setTaskMessage('准备写入数据库...');

    try {
      const result = await syncSeriesData({
        series,
        headers: parsedFile.headers,
        keyMode: importMode,
        rows: parsedFile.rows,
        fileName,
        deleteMissing: false,
        onProgress: (progress, message) => {
          setTaskProgress(progress);
          setTaskMessage(message);
        }
      });

      setStats(result);
      if (importMode === 'append') {
        setInfo(
          `增量导入完成：新增 ${result.added} 行，跳过重复 ${result.unchanged} 行。当前系列共 ${result.totalAfter} 行。`
        );
      } else {
        setInfo(
          `整表覆盖导入完成：当前系列共 ${result.totalAfter} 行。`
        );
      }
      setTaskProgress(100);
      setTaskMessage('导入完成');

      await refreshSeriesList();
      setSelectedSeries(series);
      await loadSeriesRows(series);
      navigate('results');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const handleClearAll = async (): Promise<void> => {
    const confirmed = window.confirm(
      `确认清空所有系列和数据吗？当前共 ${seriesList.length} 个系列、${totalRowsInDb} 条数据。该操作无法撤销。`
    );
    if (!confirmed) {
      return;
    }

    await clearAllData();
    setSeriesList([]);
    setRows([]);
    setFilters([]);
    setSelectedSeries('');
    setStats(null);
    setParsedFile(null);
    setFileName('');
    setError('');
    setInfo('已清空所有本地数据。');
    setGroupColumns([]);
    setCompareInfoColumns([]);
    setCompareGroups([]);
    setCompareResult(null);
    setChartColumns([]);
    setNumericAggregateMode('sum');
    setTextAggregateMode('first');
    setChartType('bar');
    setBarOrientation('vertical');
    setChartXAxisTitle('数据组');
    setChartYAxisTitle('汇总值');
    setExportingSeries('');
    setClearingSeries('');
  };

  const handleExportSeries = async (meta: SeriesMeta): Promise<void> => {
    if (exportingSeries || clearingSeries) {
      return;
    }

    const confirmed = window.confirm(
      `确认导出系列 ${meta.series} 为 XLSX 吗？将导出 ${meta.rowCount} 行数据。`
    );
    if (!confirmed) {
      return;
    }

    setError('');
    setInfo('');
    setExportingSeries(meta.series);

    try {
      const seriesRows = await getSeriesRows(meta.series);
      await exportSeriesToXlsx({
        series: meta.series,
        headers: meta.headers,
        rows: seriesRows
      });
      setInfo(`系列 ${meta.series} 已导出为 XLSX（共 ${seriesRows.length} 行）。`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : `导出系列 ${meta.series} 失败`);
    } finally {
      setExportingSeries('');
    }
  };

  const handleClearSeries = async (meta: SeriesMeta): Promise<void> => {
    if (clearingSeries || exportingSeries) {
      return;
    }

    const confirmed = window.confirm(
      `确认清空系列 ${meta.series} 吗？将删除该系列 ${meta.rowCount} 行数据，且无法撤销。`
    );
    if (!confirmed) {
      return;
    }

    setError('');
    setInfo('');
    setClearingSeries(meta.series);

    try {
      const removedRows = await clearSeriesData(meta.series);

      if (selectedSeries === meta.series) {
        setSelectedSeries('');
        setRows([]);
        setFilters([]);
      }

      await refreshSeriesList();
      setInfo(`系列 ${meta.series} 已清空，删除 ${removedRows} 行。`);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : `清空系列 ${meta.series} 失败`);
    } finally {
      setClearingSeries('');
    }
  };

  const updateGroupValue = (groupId: string, column: string, value: string): void => {
    setCompareGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              values: {
                ...group.values,
                [column]: value
              }
            }
          : group
      )
    );
  };

  const removeGroup = (groupId: string): void => {
    setCompareGroups((current) => current.filter((item) => item.id !== groupId));
  };

  const addGroup = (): void => {
    setCompareError('');

    if (groupColumns.length === 0) {
      setCompareError('请先选择“数据组维度列”，再添加数据组。');
      return;
    }

    setCompareGroups((current) => [...current, newGroup(groupColumns)]);
  };

  const runComparison = async (): Promise<void> => {
    setCompareError('');

    if (groupColumns.length === 0) {
      setCompareError('请先选择数据组维度列。');
      return;
    }

    const activeGroups = compareGroups.filter((group) =>
      groupColumns.every((column) => String(group.values[column] ?? '').trim() !== '')
    );

    if (activeGroups.length < 2) {
      setCompareError('请至少配置 2 个有效数据组（每个维度列都要填写值）。');
      return;
    }

    if (infoColumnsForComparison.length === 0) {
      setCompareError('当前没有可比对的信息列，请先调整维度列或信息列。');
      return;
    }

    setComparing(true);

    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const labelCounter = new Map<string, number>();
      const resultRows: CompareResultRow[] = [];

      activeGroups.forEach((group) => {
        const matchedRows = filteredRows.filter((row) =>
          groupColumns.every((column) => {
            const groupValue = String(group.values[column] ?? '').trim();
            if (isAllGroupValue(groupValue)) {
              return true;
            }

            return String(row[column] ?? '').trim() === groupValue;
          })
        );

        const values: Record<string, string | number> = {};

        infoColumnsForComparison.forEach((column) => {
          values[column] = summarizeColumn(
            matchedRows,
            column,
            numericAggregateMode,
            textAggregateMode
          );
        });

        const baseLabel = makeGroupLabel(group, groupColumns);
        const sameLabelCount = (labelCounter.get(baseLabel) ?? 0) + 1;
        labelCounter.set(baseLabel, sameLabelCount);
        const finalLabel = sameLabelCount > 1 ? `${baseLabel} #${sameLabelCount}` : baseLabel;

        resultRows.push({
          groupLabel: finalLabel,
          matchedCount: matchedRows.length,
          values
        });
      });

      setCompareResult({
        infoColumns: infoColumnsForComparison,
        rows: resultRows
      });
    } finally {
      setComparing(false);
    }
  };

  const renderImportPage = (): JSX.Element => {
    const headers = parsedFile?.headers ?? [];

    return (
      <section className="card">
        <div className="card-head">
          <h3>数据导入</h3>
          <span className="muted">同系列可选：整表覆盖 或 增量追加（整行去重）</span>
        </div>

        <div className="grid two">
          <label>
            系列名
            <input
              type="text"
              value={seriesInput}
              placeholder="例如：trap_daily"
              onChange={(event) => setSeriesInput(event.target.value)}
            />
          </label>

          <label>
            快速选择已有系列
            <SearchableSelect
              options={[{ value: '', label: '手动输入新系列' }, ...seriesOptions]}
              value={seriesInput}
              onChange={setSeriesInput}
              placeholder="输入或搜索系列名"
              allowCustom
            />
          </label>

          <label>
            导入策略
            <SearchableSelect
              options={[
                { value: 'snapshot', label: '整表覆盖（快照）' },
                { value: 'append', label: '增量追加（整行去重）' }
              ]}
              value={importMode}
              onChange={(value) => setImportMode(value === 'append' ? 'append' : 'snapshot')}
            />
          </label>
        </div>

        <DropZone onFileSelected={(file) => void handleFileSelected(file)} />

        {(parsing || importing) && (
          <div className="progress-card top-gap">
            <div className="progress-head">
              <strong>{parsing ? '文件解析中' : '数据导入中'}</strong>
              <span>{taskProgress}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${taskProgress}%` }} />
            </div>
            <p className="muted">{taskMessage || '处理中...'}</p>
          </div>
        )}

        {parsedFile && (
          <div className="import-preview">
            <div>
              <strong>文件：</strong>
              {fileName}
            </div>
            <div>
              <strong>表头：</strong>
              {headers.join(', ')}
            </div>
            <div>
              <strong>解析行数：</strong>
              {parsedFile.rows.length}
            </div>
            <div className="merge-summary muted">
              {importMode === 'append'
                ? '当前策略：增量追加。仅新增“数据库中未存在的整行”，重复整行会自动跳过。'
                : '当前策略：整表覆盖。再次导入同系列会用新文件替换旧数据。'}
            </div>
            <div className="actions">
              <button
                type="button"
                className="button"
                onClick={() => void handleImport()}
                disabled={parsing || importing}
              >
                {parsing ? '解析中...' : importing ? '导入中...' : importMode === 'append' ? '增量导入同系列' : '导入并覆盖同系列'}
              </button>
            </div>
          </div>
        )}

        {stats && (
          <div className="stats">
            <span>新增: {stats.added}</span>
            <span>更新: {stats.updated}</span>
            <span>未变更: {stats.unchanged}</span>
            <span>删除: {stats.deleted}</span>
            <span>导入后总数: {stats.totalAfter}</span>
          </div>
        )}
      </section>
    );
  };

  const renderResultsPage = (): JSX.Element => {
    return (
      <>
        <section className="card">
          <div className="card-head">
            <h3>结果观察</h3>
            <button type="button" className="button secondary" onClick={() => void refreshSeriesList()}>
              刷新系列列表
            </button>
          </div>

          <div className="grid two">
            <label>
              选择系列
              <SearchableSelect
                options={[
                  { value: '', label: '请选择' },
                  ...seriesList.map((item) => ({
                    value: item.series,
                    label: `${item.series} (${item.rowCount})`
                  }))
                ]}
                value={selectedSeries}
                onChange={setSelectedSeries}
                placeholder="搜索系列"
              />
            </label>

            <div className="meta-block muted">
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowSeriesMeta((current) => !current)}
              >
                {showSeriesMeta ? '收起数据库信息' : '展开数据库信息'}
              </button>

              {showSeriesMeta &&
                (selectedMeta ? (
                  <>
                    <div>导入策略：{modeLabel(selectedMeta.keyMode)}</div>
                    <div>上次导入：{selectedMeta.lastFileName}</div>
                    <div>更新时间：{formatTime(selectedMeta.updatedAt)}</div>
                  </>
                ) : (
                  <div>请选择系列后查看详情</div>
                ))}
            </div>
          </div>
        </section>

        <FilterPanel headers={viewHeaders} rows={rows} filters={filters} onChange={setFilters} />

        <section className="card">
          <div className="card-head">
            <h3>数据组创建与比对</h3>
            <span className="muted">先配置维度列与数据组，再点击“开始比对”生成结果</span>
          </div>

          {viewHeaders.length === 0 ? (
            <p className="muted">请选择系列后再创建数据组。</p>
          ) : (
            <>
              <div className="grid two">
                <label>
                  数据组维度列（可多选）
                  <SearchableMultiSelect
                    options={headerOptions}
                    values={groupColumns}
                    onChange={setGroupColumns}
                    placeholder="搜索并选择维度列"
                  />
                </label>

                <label>
                  信息列（可多选，不选=全部信息列）
                  <SearchableMultiSelect
                    options={infoColumnOptions}
                    values={compareInfoColumns}
                    onChange={setCompareInfoColumns}
                    placeholder="搜索并选择信息列"
                    disabled={infoColumnOptions.length === 0}
                  />
                </label>
              </div>

              <div className="compare-summary muted top-gap">
                维度列：{groupColumns.length} 个
                <br />
                数据组：{compareGroups.length} 个
                <br />
                生效信息列：{infoColumnsForComparison.length} 个
              </div>

              <div className="grid two top-gap">
                <label>
                  多行匹配时数值取值方式
                  <SearchableSelect
                    options={[
                      { value: 'sum', label: '求和' },
                      { value: 'max', label: '最大值' },
                      { value: 'min', label: '最小值' },
                      { value: 'avg', label: '平均值' },
                      { value: 'first', label: '首条' },
                      { value: 'last', label: '末条' }
                    ]}
                    value={numericAggregateMode}
                    onChange={(value) => {
                      const next: NumericAggregateMode[] = ['sum', 'max', 'min', 'avg', 'first', 'last'];
                      setNumericAggregateMode(
                        next.includes(value as NumericAggregateMode)
                          ? (value as NumericAggregateMode)
                          : 'sum'
                      );
                    }}
                  />
                </label>

                <label>
                  多行匹配时文本取值方式
                  <SearchableSelect
                    options={[
                      { value: 'first', label: '首条' },
                      { value: 'last', label: '末条' },
                      { value: 'uniqueJoin', label: '去重合并' }
                    ]}
                    value={textAggregateMode}
                    onChange={(value) => {
                      const next: TextAggregateMode[] = ['first', 'last', 'uniqueJoin'];
                      setTextAggregateMode(
                        next.includes(value as TextAggregateMode)
                          ? (value as TextAggregateMode)
                          : 'first'
                      );
                    }}
                  />
                </label>
              </div>

              <p className="muted">以上取值方式仅在“匹配行数大于 1”时生效。</p>

              <div className="card top-gap">
                <div className="card-head">
                  <h3>数据组配置</h3>
                  <div className="actions">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={addGroup}
                      disabled={groupColumns.length === 0}
                    >
                      添加数据组
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => void runComparison()}
                      disabled={comparing || loading || compareGroups.length === 0 || groupColumns.length === 0}
                    >
                      {comparing ? '比对中...' : '开始比对'}
                    </button>
                  </div>
                </div>

                {groupColumns.length === 0 ? (
                  <p className="muted">请先在上方选择至少 1 个维度列。</p>
                ) : compareGroups.length === 0 ? (
                  <p className="muted">点击“添加数据组”开始配置。</p>
                ) : (
                  <div className="group-list">
                    {compareGroups.map((group, index) => (
                      <div key={group.id} className="group-card">
                        <div className="group-card-head">
                          <span className="group-index">数据组 #{index + 1}</span>
                          <button
                            type="button"
                            className="button danger"
                            onClick={() => removeGroup(group.id)}
                            disabled={compareGroups.length <= 1}
                          >
                            删除
                          </button>
                        </div>

                        <div className="grid two">
                          {groupColumns.map((column) => (
                            <label key={`${group.id}-${column}`}>
                              {column}
                              <SearchableSelect
                                options={[
                                  { value: '', label: '请选择' },
                                  { value: ALL_GROUP_VALUE, label: 'ALL（全部）' },
                                  ...toOptions(groupValueOptionsMap[column] ?? [])
                                ]}
                                value={group.values[column] ?? ''}
                                onChange={(value) => updateGroupValue(group.id, column, value)}
                                placeholder={`搜索/输入 ${column}，或输入 ALL`}
                                allowCustom
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {compareError && <p className="error top-gap">{compareError}</p>}

              {compareResult && (
                <>
                  <section className="card top-gap">
                    <div className="card-head">
                      <h3>比对图表</h3>
                      <span className="muted">图表仅展示可数值化的信息列</span>
                    </div>

                    {chartableColumns.length === 0 ? (
                      <p className="muted">当前结果没有可绘图的数值列，请调整信息列后重试。</p>
                    ) : (
                      <>
                        <div className="grid two">
                          <label>
                            图表类型
                            <SearchableSelect
                              options={[
                                { value: 'bar', label: '柱状图' },
                                { value: 'line', label: '折线图' },
                                { value: 'area', label: '面积图' },
                                { value: 'scatter', label: '散点图' }
                              ]}
                              value={chartType}
                              onChange={(value) => {
                                const next: MultiChartType[] = ['bar', 'line', 'area', 'scatter'];
                                setChartType(next.includes(value as MultiChartType) ? (value as MultiChartType) : 'bar');
                              }}
                            />
                          </label>

                          <label>
                            图表参数（可多选，不选=全部数值列）
                            <SearchableMultiSelect
                              options={toOptions(chartableColumns)}
                              values={chartColumns}
                              onChange={setChartColumns}
                              placeholder="搜索图表参数列"
                            />
                          </label>
                        </div>

                        <div className="grid two top-gap">
                          <label>
                            X 轴标题
                            <input
                              type="text"
                              value={chartXAxisTitle}
                              placeholder="例如：数据组"
                              onChange={(event) => setChartXAxisTitle(event.target.value)}
                            />
                          </label>

                          <label>
                            Y 轴标题
                            <input
                              type="text"
                              value={chartYAxisTitle}
                              placeholder="例如：数值"
                              onChange={(event) => setChartYAxisTitle(event.target.value)}
                            />
                          </label>
                        </div>

                        {chartType === 'bar' && (
                          <div className="grid two top-gap">
                            <label>
                              柱状图方向
                              <SearchableSelect
                                options={[
                                  { value: 'vertical', label: '纵向（默认）' },
                                  { value: 'horizontal', label: '横向' }
                                ]}
                                value={barOrientation}
                                onChange={(value) =>
                                  setBarOrientation(value === 'horizontal' ? 'horizontal' : 'vertical')
                                }
                              />
                            </label>
                          </div>
                        )}

                        <MultiSeriesChart
                          categories={chartCategories}
                          series={chartSeries}
                          type={chartType}
                          barOrientation={barOrientation}
                          xAxisTitle={chartXAxisTitle}
                          yAxisTitle={chartYAxisTitle}
                        />
                      </>
                    )}
                  </section>

                  <div className="table-wrap top-gap">
                    <table className="compare-table">
                      <thead>
                        <tr>
                          <th>数据组</th>
                          <th>匹配行数</th>
                          {compareResult.infoColumns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {compareResult.rows.map((row) => (
                          <tr key={row.groupLabel}>
                            <td>{row.groupLabel}</td>
                            <td>{row.matchedCount}</td>
                            {compareResult.infoColumns.map((column) => (
                              <td key={column}>{formatCompareValue(row.values[column] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h3>原始数据</h3>
            <button
              type="button"
              className="button secondary"
              onClick={() => setShowRawData((current) => !current)}
            >
              {showRawData ? '收起原始数据' : '展开原始数据'}
            </button>
          </div>

          {!showRawData ? (
            <p className="muted">默认收起，防止数据淹没页面。需要时再展开查看。</p>
          ) : loading ? (
            <p>加载中...</p>
          ) : viewHeaders.length === 0 ? (
            <p className="muted">请选择一个系列查看数据。</p>
          ) : (
            <>
              <div className="table-wrap data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      {viewHeaders.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row, index) => (
                      <tr key={`row-${index}`}>
                        {viewHeaders.map((header) => (
                          <td key={header}>{row[header]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredRows.length > MAX_RENDER_ROWS && (
                <p className="muted">仅展示前 {MAX_RENDER_ROWS} 条，请继续筛选缩小范围。</p>
              )}
            </>
          )}
        </section>
      </>
    );
  };

  const renderSettingsPage = (): JSX.Element => {
    return (
      <section className="card">
        <div className="card-head">
          <h3>设置</h3>
          <span className="muted">
            当前共 {seriesList.length} 个系列，{totalRowsInDb} 条数据
          </span>
        </div>

        <div className="danger-zone">
          <p>清空操作会删除本地数据库内所有系列和数据，用于排除错误数据后的重建。该操作不可恢复。</p>
          <button type="button" className="button danger" onClick={() => void handleClearAll()}>
            清空全部数据
          </button>
        </div>

        <div className="table-wrap top-gap">
          <table className="meta-table">
            <thead>
              <tr>
                <th>系列</th>
                <th>行数</th>
                <th>导入策略</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {seriesList.map((item) => (
                <tr key={item.series}>
                  <td>{item.series}</td>
                  <td>{item.rowCount}</td>
                  <td>{modeLabel(item.keyMode)}</td>
                  <td>{formatTime(item.updatedAt)}</td>
                  <td>
                    <div className="series-actions">
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => void handleExportSeries(item)}
                        disabled={Boolean(exportingSeries) || Boolean(clearingSeries)}
                      >
                        {exportingSeries === item.series ? '导出中...' : '导出 XLSX'}
                      </button>
                      <button
                        type="button"
                        className="button danger"
                        onClick={() => void handleClearSeries(item)}
                        disabled={Boolean(clearingSeries) || Boolean(exportingSeries)}
                      >
                        {clearingSeries === item.series ? '清空中...' : '清空系列'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <main className="container">
      <header className="hero">
        <h1>Xls Data View</h1>
        <p>结果观察、数据导入、设置清库三页分离。导入时自动行主键，确保每行都保留。</p>
      </header>

      <nav className="top-nav">
        <button
          type="button"
          className={`nav-button ${page === 'results' ? 'active' : ''}`}
          onClick={() => navigate('results')}
        >
          结果观察
        </button>
        <button
          type="button"
          className={`nav-button ${page === 'import' ? 'active' : ''}`}
          onClick={() => navigate('import')}
        >
          数据导入
        </button>
        <button
          type="button"
          className={`nav-button ${page === 'settings' ? 'active' : ''}`}
          onClick={() => navigate('settings')}
        >
          设置
        </button>
      </nav>

      {page === 'results' && renderResultsPage()}
      {page === 'import' && renderImportPage()}
      {page === 'settings' && renderSettingsPage()}

      {info && <p className="info">{info}</p>}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
