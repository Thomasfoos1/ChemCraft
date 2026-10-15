import elementsJson from '../content/elements.json';

export interface ElementInfo {
  symbol: string;
  name: string;
  atomicNumber: number;
  color: string;
  dark: string;
  category: 'metal' | 'nonmetal';
  fact: string;
  depositName: string;
}

export const ELEMENTS: Record<string, ElementInfo> = Object.fromEntries(
  Object.entries(elementsJson as Record<string, Omit<ElementInfo, 'symbol'>>).map(([symbol, e]) => [
    symbol,
    { symbol, ...e } as ElementInfo,
  ]),
);

export const ELEMENT_SYMBOLS = Object.keys(ELEMENTS);

export function isElementSymbol(id: string): boolean {
  return id in ELEMENTS;
}
