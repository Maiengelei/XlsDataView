import { useEffect, useMemo, useState } from 'react';
import DropZone from './components/DropZone';
import FilterPanel from './components/FilterPanel';
import SearchableMultiSelect from './components/SearchableMultiSelect';
import SearchableSelect, { type SelectOption } from './components/SearchableSelect';
import { applyFilters } from './lib/filter';
import { clearAllData, getSeriesRows, listSeriesMeta, syncSeriesData } from './lib/sync';
import { parseXlsFile } from './lib/xls';
import type { FilterCondition, ImportStats, ParsedSheet, RowData, SeriesMeta } from './types';

const MAX_RENDER_ROWS = 500;

type AppPage = 'results' | 'import' | 'settings';

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

function summarizeColumn(rows: RowData[], column: string): string | number {
  const values = rows
    .map((row) => String(row[column] ?? '').trim())
    .filter((value) => value !== '');

  if (values.length === 0) {
    return '';
  }

  const parsed = values.map((value) => asNumber(value));
  const allNumeric = parsed.every((value) => value !== null);

  if (allNumeric) {
    return parsed.reduce((sum, value) => sum + (value ?? 0), 0);
  }

  const distinct = Array.from(new Set(values));
  if (distinct.length === 1) {
    return distinct[0];
  }

  const preview = distinct.slice(0, 3).join(' / ');
  return distinct.length > 3 ? `${preview} ...(${distinct.length}项)` : preview;
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

export default function App(): JSX.Element {
  const [page, setPage] = useState<AppPage>(pageFromHash(window.location.hash));

  const [seriesList, setSeriesList] = useState<SeriesMeta[]>([]);
  const [selectedSeries, setSelectedSeries] = useState('');

  const [rows, setRows] = useState<RowData[]>([]);
  const [filters, setFilters] = useState<FilterCondition[]>([]);

  const [seriesInput, setSeriesInput] = useState('');
  const [parsedFile, setParsedFile] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState('');

  const [stats, setStats] = useState<ImportStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
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
  }, [filteredRows, groupColumns, compareInfoColumns, compareGroups]);

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
        keyMode: 'snapshot',
        rows: parsedFile.rows,
        fileName,
        deleteMissing: false,
        onProgress: (progress, message) => {
          setTaskProgress(progress);
          setTaskMessage(message);
        }
      });

      setStats(result);
      setInfo(
        `已完整导入 ${result.totalAfter} 行，并为每行自动生成主键。再次导入同系列会按新文件整表覆盖，避免丢行。`
      );
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
    const confirmed = window.confirm('确认清空所有系列和数据吗？该操作无法撤销。');
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
          groupColumns.every(
            (column) => String(row[column] ?? '').trim() === String(group.values[column] ?? '').trim()
          )
        );

        const values: Record<string, string | number> = {};

        infoColumnsForComparison.forEach((column) => {
          values[column] = summarizeColumn(matchedRows, column);
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
          <span className="muted">自动行主键模式：保留每一行，不需要选择主键列</span>
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
              导入策略：每行自动分配唯一行 ID 入库，不按业务列去重，不会因键冲突丢弃同日期重复记录。
            </div>
            <div className="actions">
              <button
                type="button"
                className="button"
                onClick={() => void handleImport()}
                disabled={parsing || importing}
              >
                {parsing ? '解析中...' : importing ? '导入中...' : '导入并覆盖同系列'}
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
                    <div>导入策略：自动行主键（整表快照）</div>
                    <div>上次导入：{selectedMeta.lastFileName}</div>
                    <div>更新时间：{formatTime(selectedMeta.updatedAt)}</div>
                  </>
                ) : (
                  <div>请选择系列后查看详情</div>
                ))}
            </div>
          </div>
        </section>

        <FilterPanel headers={viewHeaders} filters={filters} onChange={setFilters} />

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
                                options={[{ value: '', label: '请选择' }, ...toOptions(groupValueOptionsMap[column] ?? [])]}
                                value={group.values[column] ?? ''}
                                onChange={(value) => updateGroupValue(group.id, column, value)}
                                placeholder={`搜索或输入 ${column}`}
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
              </tr>
            </thead>
            <tbody>
              {seriesList.map((item) => (
                <tr key={item.series}>
                  <td>{item.series}</td>
                  <td>{item.rowCount}</td>
                  <td>自动行主键（整表快照）</td>
                  <td>{formatTime(item.updatedAt)}</td>
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
