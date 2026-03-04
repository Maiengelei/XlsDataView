export interface ChartSeries {
  name: string;
  values: number[];
}

export type MultiChartType = 'bar' | 'line' | 'area' | 'scatter';
export type BarOrientation = 'vertical' | 'horizontal';

interface MultiSeriesChartProps {
  categories: string[];
  series: ChartSeries[];
  type: MultiChartType;
  barOrientation?: BarOrientation;
  xAxisTitle?: string;
  yAxisTitle?: string;
}

const COLORS = ['#2563eb', '#f97316', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#ca8a04'];

function shortLabel(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 14 ? `${trimmed.slice(0, 14)}...` : trimmed;
}

function valueRange(series: ChartSeries[]): { min: number; max: number } {
  const values = series.flatMap((item) => item.values);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);

  if (min === max) {
    return { min: min - 1, max: max + 1 };
  }

  return { min, max };
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2);
}

function renderVerticalChart(params: {
  categories: string[];
  series: ChartSeries[];
  type: MultiChartType;
  xAxisTitle: string;
  yAxisTitle: string;
}): JSX.Element {
  const { categories, series, type, xAxisTitle, yAxisTitle } = params;

  const height = 380;
  const paddingTop = 22;
  const paddingBottom = 120;
  const paddingLeft = 68;
  const paddingRight = 28;

  const width = Math.max(920, categories.length * 130);
  const innerWidth = width - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;

  const { min, max } = valueRange(series);
  const range = max - min;

  const toY = (value: number): number => {
    return paddingTop + ((max - value) / range) * innerHeight;
  };

  const baselineY = toY(0);
  const categoryStep = innerWidth / categories.length;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
      <line
        x1={paddingLeft}
        y1={paddingTop}
        x2={paddingLeft}
        y2={paddingTop + innerHeight}
        stroke="#94a3b8"
      />
      <line
        x1={paddingLeft}
        y1={baselineY}
        x2={paddingLeft + innerWidth}
        y2={baselineY}
        stroke="#94a3b8"
      />

      {categories.map((category, categoryIndex) => {
        const centerX = paddingLeft + categoryStep * categoryIndex + categoryStep / 2;
        const groupWidth = categoryStep * 0.78;
        const barWidth = Math.max(8, Math.min(24, groupWidth / Math.max(series.length, 1) - 4));
        const groupStart = centerX - (series.length * (barWidth + 4) - 4) / 2;

        return (
          <g key={`category-${categoryIndex}`}>
            {type === 'bar' &&
              series.map((item, seriesIndex) => {
                const value = item.values[categoryIndex] ?? 0;
                const y = toY(value);
                const barY = Math.min(y, baselineY);
                const barHeight = Math.max(Math.abs(baselineY - y), 1);
                const x = groupStart + seriesIndex * (barWidth + 4);
                const labelY = value >= 0 ? barY - 4 : barY + barHeight + 12;

                return (
                  <g key={`bar-${categoryIndex}-${item.name}`}>
                    <rect
                      x={x}
                      y={barY}
                      width={barWidth}
                      height={barHeight}
                      fill={COLORS[seriesIndex % COLORS.length]}
                      opacity="0.86"
                    />
                    <text
                      x={x + barWidth / 2}
                      y={labelY}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#334155"
                    >
                      {formatValue(value)}
                    </text>
                  </g>
                );
              })}

            <text
              x={centerX}
              y={height - 50}
              textAnchor="end"
              fontSize="11"
              fill="#334155"
              transform={`rotate(-32 ${centerX} ${height - 50})`}
            >
              {shortLabel(category)}
            </text>
          </g>
        );
      })}

      {(type === 'line' || type === 'area' || type === 'scatter') &&
        series.map((item, seriesIndex) => {
          const pointsArr = categories.map((_, categoryIndex) => {
            const x = paddingLeft + categoryStep * categoryIndex + categoryStep / 2;
            const y = toY(item.values[categoryIndex] ?? 0);
            return { x, y };
          });
          const points = pointsArr.map((point) => `${point.x},${point.y}`).join(' ');

          return (
            <g key={`curve-${item.name}`}>
              {type === 'area' && pointsArr.length > 1 && (
                <polygon
                  points={`${points} ${pointsArr[pointsArr.length - 1].x},${baselineY} ${pointsArr[0].x},${baselineY}`}
                  fill={COLORS[seriesIndex % COLORS.length]}
                  opacity="0.2"
                />
              )}

              {(type === 'line' || type === 'area') && (
                <polyline
                  points={points}
                  fill="none"
                  stroke={COLORS[seriesIndex % COLORS.length]}
                  strokeWidth="2.3"
                />
              )}

              {(type === 'line' || type === 'scatter' || type === 'area') &&
                pointsArr.map((point, pointIndex) => (
                  <circle
                    key={`dot-${item.name}-${pointIndex}`}
                    cx={point.x}
                    cy={point.y}
                    r={type === 'scatter' ? 4 : 3}
                    fill={COLORS[seriesIndex % COLORS.length]}
                  />
                ))}
            </g>
          );
        })}

      <text x={8} y={paddingTop + 2} fontSize="11" fill="#475569">
        {formatValue(max)}
      </text>
      <text x={8} y={paddingTop + innerHeight} fontSize="11" fill="#475569">
        {formatValue(min)}
      </text>

      <text x={paddingLeft + innerWidth / 2} y={height - 10} textAnchor="middle" fontSize="12" fill="#334155">
        {xAxisTitle}
      </text>
      <text
        x={18}
        y={paddingTop + innerHeight / 2}
        textAnchor="middle"
        fontSize="12"
        fill="#334155"
        transform={`rotate(-90 18 ${paddingTop + innerHeight / 2})`}
      >
        {yAxisTitle}
      </text>
    </svg>
  );
}

function renderHorizontalBarChart(params: {
  categories: string[];
  series: ChartSeries[];
  xAxisTitle: string;
  yAxisTitle: string;
}): JSX.Element {
  const { categories, series, xAxisTitle, yAxisTitle } = params;

  const height = Math.max(380, categories.length * 58 + 100);
  const width = 980;
  const paddingTop = 22;
  const paddingBottom = 74;
  const paddingLeft = 170;
  const paddingRight = 40;

  const innerWidth = width - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;

  const { min, max } = valueRange(series);
  const range = max - min;

  const toX = (value: number): number => {
    return paddingLeft + ((value - min) / range) * innerWidth;
  };

  const baselineX = toX(0);
  const categoryStep = innerHeight / categories.length;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
      <line
        x1={paddingLeft}
        y1={paddingTop + innerHeight}
        x2={paddingLeft + innerWidth}
        y2={paddingTop + innerHeight}
        stroke="#94a3b8"
      />
      <line x1={baselineX} y1={paddingTop} x2={baselineX} y2={paddingTop + innerHeight} stroke="#94a3b8" />

      {categories.map((category, categoryIndex) => {
        const centerY = paddingTop + categoryStep * categoryIndex + categoryStep / 2;
        const groupHeight = categoryStep * 0.78;
        const barHeight = Math.max(8, Math.min(24, groupHeight / Math.max(series.length, 1) - 3));
        const groupStartY = centerY - (series.length * (barHeight + 3) - 3) / 2;

        return (
          <g key={`h-category-${categoryIndex}`}>
            <text x={paddingLeft - 8} y={centerY + 4} textAnchor="end" fontSize="11" fill="#334155">
              {shortLabel(category)}
            </text>

            {series.map((item, seriesIndex) => {
              const value = item.values[categoryIndex] ?? 0;
              const x = toX(value);
              const rectX = Math.min(baselineX, x);
              const rectWidth = Math.max(Math.abs(x - baselineX), 1);
              const y = groupStartY + seriesIndex * (barHeight + 3);
              const labelX = value >= 0 ? rectX + rectWidth + 4 : rectX - 4;
              const labelAnchor = value >= 0 ? 'start' : 'end';

              return (
                <g key={`h-bar-${categoryIndex}-${item.name}`}>
                  <rect
                    x={rectX}
                    y={y}
                    width={rectWidth}
                    height={barHeight}
                    fill={COLORS[seriesIndex % COLORS.length]}
                    opacity="0.86"
                  />
                  <text
                    x={labelX}
                    y={y + barHeight / 2 + 3}
                    textAnchor={labelAnchor}
                    fontSize="10"
                    fill="#334155"
                  >
                    {formatValue(value)}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      <text x={paddingLeft} y={height - 45} fontSize="11" fill="#475569" textAnchor="start">
        {formatValue(min)}
      </text>
      <text x={paddingLeft + innerWidth} y={height - 45} fontSize="11" fill="#475569" textAnchor="end">
        {formatValue(max)}
      </text>

      <text x={paddingLeft + innerWidth / 2} y={height - 12} textAnchor="middle" fontSize="12" fill="#334155">
        {xAxisTitle}
      </text>
      <text
        x={26}
        y={paddingTop + innerHeight / 2}
        textAnchor="middle"
        fontSize="12"
        fill="#334155"
        transform={`rotate(-90 26 ${paddingTop + innerHeight / 2})`}
      >
        {yAxisTitle}
      </text>
    </svg>
  );
}

export default function MultiSeriesChart({
  categories,
  series,
  type,
  barOrientation = 'vertical',
  xAxisTitle = 'X 轴',
  yAxisTitle = 'Y 轴'
}: MultiSeriesChartProps): JSX.Element {
  if (categories.length === 0 || series.length === 0) {
    return <p className="muted">暂无可绘制数据</p>;
  }

  return (
    <div className="multi-chart-wrap top-gap">
      <div className="compare-legend muted">
        {series.map((item, index) => (
          <span key={item.name} className="legend-item">
            <span className="dot" style={{ background: COLORS[index % COLORS.length] }} />
            {item.name}
          </span>
        ))}
      </div>

      <div className="compare-chart-scroll">
        {type === 'bar' && barOrientation === 'horizontal'
          ? renderHorizontalBarChart({ categories, series, xAxisTitle, yAxisTitle })
          : renderVerticalChart({ categories, series, type, xAxisTitle, yAxisTitle })}
      </div>
    </div>
  );
}
