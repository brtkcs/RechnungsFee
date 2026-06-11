export type KontorahmenModus = '' | 'skr03' | 'skr04'

export const KONTORAHMEN_LS_KEY = 'rechnungsfee.kontorahmen_anzeige'

export function getKontorahmenModus(): KontorahmenModus {
  return (localStorage.getItem(KONTORAHMEN_LS_KEY) ?? '') as KontorahmenModus
}

export function katLabel(
  kat: { name: string; konto_skr03?: string | null; konto_skr04?: string | null },
  modus: KontorahmenModus
): string {
  if (!modus) return kat.name
  const kto = modus === 'skr03' ? kat.konto_skr03 : kat.konto_skr04
  return kto ? `${kat.name} [${kto}]` : kat.name
}
