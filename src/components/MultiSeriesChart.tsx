export interface ChartSeries {
  name: string;
  values: number[];
}

interface MultiSeriesChartProps {
  categories: string[];
  series: ChartSeries[];
  type: 'bar' | 'line';
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

export default function MultiSeriesChart({ categories, series, type }: MultiSeriesChartProps): JSX.Element {
  if (categories.length === 0 || series.length === 0) {
    return <p className="muted">暂无可绘制数据。</p>;
  }

  const height = 360;
  const paddingTop = 20;
  const paddingBottom = 110;
  const paddingLeft = 55;
  const paddingRight = 22;

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

                    return (
                      <rect
                        key={`bar-${categoryIndex}-${item.name}`}
                        x={x}
                        y={barY}
                        width={barWidth}
                        height={barHeight}
                        fill={COLORS[seriesIndex % COLORS.length]}
                        opacity="0.86"
                      />
                    );
                  })}

                <text
                  x={centerX}
                  y={height - 44}
                  textAnchor="end"
                  fontSize="11"
                  fill="#334155"
                  transform={`rotate(-32 ${centerX} ${height - 44})`}
                >
                  {shortLabel(category)}
                </text>
              </g>
            );
          })}

          {type === 'line' &&
            series.map((item, seriesIndex) => {
              const points = categories
                .map((_, categoryIndex) => {
                  const x = paddingLeft + categoryStep * categoryIndex + categoryStep / 2;
                  const y = toY(item.values[categoryIndex] ?? 0);
                  return `${x},${y}`;
                })
                .join(' ');

              return (
                <g key={`line-${item.name}`}>
                  <polyline
                    points={points}
                    fill="none"
                    stroke={COLORS[seriesIndex % COLORS.length]}
                    strokeWidth="2.3"
                  />
                  {categories.map((_, categoryIndex) => {
                    const x = paddingLeft + categoryStep * categoryIndex + categoryStep / 2;
                    const y = toY(item.values[categoryIndex] ?? 0);
                    return (
                      <circle
                        key={`dot-${item.name}-${categoryIndex}`}
                        cx={x}
                        cy={y}
                        r={3}
                        fill={COLORS[seriesIndex % COLORS.length]}
                      />
                    );
                  })}
                </g>
              );
            })}

          <text x={8} y={paddingTop + 2} fontSize="11" fill="#475569">
            {formatValue(max)}
          </text>
          <text x={8} y={paddingTop + innerHeight} fontSize="11" fill="#475569">
            {formatValue(min)}
          </text>
        </svg>
      </div>
    </div>
  );
}
