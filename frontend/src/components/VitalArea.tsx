import { useMemo } from 'react';
import type { Reading } from '../data/types';
import { buildSeries, summaryOf } from '../lib/chart';
import { toMs } from '../lib/time';
import type { VitalKey } from '../lib/vitals';
import { ChartMetric, HEIGHT, MARGIN, useWidth, type Falls } from './VitalsChart';

/**
 * One vital as a green area chart for the Resumen card. The drawing is hidden from assistive technology;
 * the sentence under it (range, latest value, readings not drawn) is its text alternative. Readings with
 * no valid value are never drawn and break the line; falls are red marks.
 */
export function VitalArea({ readings, vital, now }: { readings: readonly Reading[]; vital: VitalKey; now: number }) {
  const [wrap, width] = useWidth();
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const model = useMemo(() => {
    if (readings.length === 0) return null;
    const times = readings.map((reading) => toMs(reading.received_at) ?? 0);
    const t0 = times[0];
    const t1 = Math.max(times[times.length - 1], t0 + 60_000);
    const falls: Falls = readings
      .filter((reading) => reading.type === 'caida')
      .map((reading) => ({ at: reading.received_at, x: (((toMs(reading.received_at) ?? t0) - t0) / (t1 - t0)) * plotW }));
    return { t0, t1, falls, series: buildSeries(readings, vital, { width: plotW, height: plotH, t0, t1 }) };
  }, [readings, vital, plotW, plotH]);

  return (
    <div className="area-chart" ref={wrap}>
      {model?.series ? (
        <ChartMetric model={model.series} falls={model.falls} width={width} t0={model.t0} t1={model.t1} showAxis cursorX={null} />
      ) : (
        <p className="chart-empty">{model ? 'Ninguna lectura de este período tiene un valor válido.' : 'Todavía no hay lecturas para dibujar.'}</p>
      )}
      <p className="chart-summary">
        {model?.falls.length ? `${model.falls.length === 1 ? '1 caída marcada' : `${model.falls.length} caídas marcadas`} en rojo. ` : ''}
        {model ? summaryOf(vital, model.series, now) : ''}
      </p>
    </div>
  );
}
