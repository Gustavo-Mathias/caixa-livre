import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { monthLabel, monthShort } from '@/lib/dates';
import { Icon } from '@/ui/icons';
import { Card, Money, Txt } from '@/ui/kit';
import { fonts, space, useTheme } from '@/ui/theme';

type Point = { key: string; in: number; out: number };

function niceScale(v: number) {
  const rough = Math.max(v, 1) / 4;
  const e = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / e;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  return { step, max: step * Math.max(1, Math.ceil(v / step - 1e-9)) };
}

const axisLabel = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',').replace(',0', '')} mil` : String(v));

/** Entradas e saídas por mês. Toque num mês para ver os valores. */
export function PairChart({ data }: { data: Point[] }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState(data.length - 1);
  const H = 190;
  const mg = { l: 40, r: 4, t: 10, b: 24 };
  const iw = Math.max(0, w - mg.l - mg.r);
  const ih = H - mg.t - mg.b;
  const maxReais = Math.max(1, ...data.map((d) => Math.max(d.in, d.out) / 100));
  const sc = niceScale(maxReais);
  const y = (reais: number) => mg.t + ih - (reais / sc.max) * ih;
  const band = data.length ? iw / data.length : 0;
  const bw = Math.min(18, band * 0.3);
  const ticks: number[] = [];
  for (let v = 0; v <= sc.max + 1e-9; v += sc.step) ticks.push(v);
  const cur = data[sel];

  return (
    <Card pad={false} style={{ paddingHorizontal: space.md, paddingVertical: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.lg, paddingHorizontal: space.xs, paddingBottom: space.sm }}>
        {([['Entradas', t.ok], ['Saídas', t.accent]] as const).map(([l, c]) => (
          <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c }} />
            <Txt variant="small" color="ink2">{l}</Txt>
          </View>
        ))}
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
        {w > 0 ? (
          <Svg width={w} height={H} accessibilityLabel="Entradas e saídas por mês">
            {ticks.map((v) => (
              <G key={v}>
                <Line x1={mg.l} x2={w - mg.r} y1={y(v)} y2={y(v)} stroke={t.line} strokeWidth={1} />
                <SvgText x={mg.l - 6} y={y(v) + 4} fill={t.ink3} fontSize={10.5} fontFamily={fonts.mono} textAnchor="end">{axisLabel(v)}</SvgText>
              </G>
            ))}
            {data.map((d, i) => {
              const cx = mg.l + band * i + band / 2;
              const hIn = (d.in / 100 / sc.max) * ih;
              const hOut = (d.out / 100 / sc.max) * ih;
              return (
                <G key={d.key}>
                  {i === sel ? <Rect x={mg.l + band * i + 2} y={mg.t - 4} width={Math.max(0, band - 4)} height={ih + 4} rx={6} fill={t.surface2} /> : null}
                  {d.in > 0 ? <Rect x={cx - bw - 1} y={mg.t + ih - hIn} width={bw} height={hIn} rx={2} fill={t.ok} /> : null}
                  {d.out > 0 ? <Rect x={cx + 1} y={mg.t + ih - hOut} width={bw} height={hOut} rx={2} fill={t.accent} /> : null}
                  <SvgText x={cx} y={H - 7} fill={i === data.length - 1 ? t.ink : t.ink3} fontSize={10.5} fontFamily={i === data.length - 1 ? fonts.monoMedium : fonts.mono} textAnchor="middle">
                    {monthShort(d.key).replace(/^./, (c) => c.toUpperCase())}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        ) : null}
        {w > 0 ? (
          <View style={{ position: 'absolute', left: mg.l, right: mg.r, top: 0, bottom: 0, flexDirection: 'row' }}>
            {data.map((d, i) => (
              <Pressable key={d.key} onPress={() => setSel(i)} accessibilityRole="button" accessibilityLabel={monthLabel(d.key)} accessibilityState={{ selected: i === sel }} style={{ flex: 1 }} />
            ))}
          </View>
        ) : null}
      </View>
      {cur ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', backgroundColor: t.surface2, borderRadius: 10, padding: space.sm + 2, marginTop: space.xs }}>
          <Pressable onPress={() => setSel((s) => Math.max(0, s - 1))} accessibilityRole="button" accessibilityLabel="Mês anterior" hitSlop={10} disabled={sel === 0} style={{ opacity: sel === 0 ? 0.3 : 1 }}>
            <Icon name="back" size={16} color={t.ink2} />
          </Pressable>
          <Pressable onPress={() => setSel((s) => Math.min(data.length - 1, s + 1))} accessibilityRole="button" accessibilityLabel="Próximo mês" hitSlop={10} disabled={sel === data.length - 1} style={{ opacity: sel === data.length - 1 ? 0.3 : 1, transform: [{ scaleX: -1 }] }}>
            <Icon name="back" size={16} color={t.ink2} />
          </Pressable>
          <Txt variant="small" style={{ fontFamily: fonts.bodySemi, textTransform: 'capitalize' }}>{monthLabel(cur.key)}</Txt>
          <Txt variant="small" color="ink2">Entradas</Txt><Money cents={cur.in} size={12.5} tone="pos" />
          <Txt variant="small" color="ink2">Saídas</Txt><Money cents={cur.out} size={12.5} />
        </View>
      ) : null}
    </Card>
  );
}
