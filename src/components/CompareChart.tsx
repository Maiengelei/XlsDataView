export interface ComparePoint {
  label: string;
  left: number;
  right: number;
}

interface CompareChartProps {
  data: ComparePoint[];
  type: 'bar' | 'line';
  leftLabel: string;
  rightLabel: string;
}

function shortLabel(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 10 ? `${trimmed.slice(0, 10)}...` : trimmed;
}

function buildRange(values: number[]): { min: number; max: number } {
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

export default function CompareChart({ data, type, leftLabel, rightLabel }: CompareChartProps): JSX.Element {
  if (data.length === 0) {
    return <p className="muted">暂无可绘制数据，请调整筛选和比对条件</p>;
  }

  const height = 340;
  const paddingTop = 18;
  const paddingBottom = 90;
  const paddingLeft = 52;
  const paddingRight = 18;

  const width = Math.max(900, data.length * 70);
  const innerWidth = width - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;

  const allValues = data.flatMap((item) => [item.left, item.right]);
  const { min, max } = buildRange(allValues);
  const range = max - min;

  const toY = (value: number): number => {
    return paddingTop + ((max - value) / range) * innerHeight;
  };

  const baselineY = toY(0);
  const step = innerWidth / data.length;

  const leftPoints = data
    .map((item, index) => {
      const x = paddingLeft + step * index + step / 2;
      return `${x},${toY(item.left)}`;
    })
    .join(' ');

  const rightPoints = data
    .map((item, index) => {
      const x = paddingLeft + step * index + step / 2;
      return `${x},${toY(item.right)}`;
    })
    .join(' ');

  return (
    <div className="compare-chart-wrap">
      <div className="compare-legend muted">
        <span className="dot left" />
        {leftLabel}
        <span className="dot right" />
        {rightLabel}
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

          {data.map((item, index) => {
            const xCenter = paddingLeft + step * index + step / 2;
            const barWidth = Math.min(16, step * 0.28);

            const leftY = toY(item.left);
            const rightY = toY(item.right);

            const leftBarY = Math.min(leftY, baselineY);
            const rightBarY = Math.min(rightY, baselineY);

            const leftBarHeight = Math.max(Math.abs(baselineY - leftY), 1);
            const rightBarHeight = Math.max(Math.abs(baselineY - rightY), 1);

            return (
              <g key={`chart-${index}`}>
                {type === 'bar' && (
                  <>
                    <rect
                      x={xCenter - barWidth - 2}
                      y={leftBarY}
                      width={barWidth}
                      height={leftBarHeight}
                      fill="#2563eb"
                      opacity="0.85"
                    />
                    <rect
                      x={xCenter + 2}
                      y={rightBarY}
                      width={barWidth}
                      height={rightBarHeight}
                      fill="#f97316"
                      opacity="0.85"
                    />
                  </>
                )}

                <text
                  x={xCenter}
                  y={height - 38}
                  textAnchor="end"
                  fontSize="11"
                  fill="#334155"
                  transform={`rotate(-35 ${xCenter} ${height - 38})`}
                >
                  {shortLabel(item.label)}
                </text>
              </g>
            );
          })}

          {type === 'line' && (
            <>
              <polyline points={leftPoints} fill="none" stroke="#2563eb" strokeWidth="2.5" />
              <polyline points={rightPoints} fill="none" stroke="#f97316" strokeWidth="2.5" />

              {data.map((item, index) => {
                const xCenter = paddingLeft + step * index + step / 2;
                const leftY = toY(item.left);
                const rightY = toY(item.right);

                return (
                  <g key={`line-dot-${index}`}>
                    <circle cx={xCenter} cy={leftY} r={3} fill="#2563eb" />
                    <circle cx={xCenter} cy={rightY} r={3} fill="#f97316" />
                    <text
                      x={xCenter}
                      y={height - 38}
                      textAnchor="end"
                      fontSize="11"
                      fill="#334155"
                      transform={`rotate(-35 ${xCenter} ${height - 38})`}
                    >
                      {shortLabel(item.label)}
                    </text>
                  </g>
                );
              })}
            </>
          )}

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
