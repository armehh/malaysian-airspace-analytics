import { describe, expect, it } from 'vitest';
import { AIRLINE_COLORS, airlineColor } from './airlineColors';

describe('airlineColor', () => {
  it('guna warna tetap bagi syarikat yang dikenali', () => {
    expect(airlineColor('Malaysia Airlines')).toBe(AIRLINE_COLORS['Malaysia Airlines']);
  });
  it('semua awalan "Lain-lain" guna warna Lain-lain', () => {
    expect(airlineColor('Lain-lain (3)')).toBe(AIRLINE_COLORS['Lain-lain']);
  });
  it('warna sandaran stabil bagi nama yang sama', () => {
    expect(airlineColor('Syarikat Baharu')).toBe(airlineColor('Syarikat Baharu'));
  });
  it('warna sandaran ialah kod warna sah', () => {
    expect(airlineColor('Syarikat Baharu')).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('tiada dua syarikat tetap berkongsi warna', () => {
    const values = Object.values(AIRLINE_COLORS);
    expect(new Set(values).size).toBe(values.length);
  });
});