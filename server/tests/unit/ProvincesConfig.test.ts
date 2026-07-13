import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

describe('provinces.yml', () => {
  let provinces: Record<string, any>[];

  beforeAll(() => {
    const filePath = path.join(__dirname, '../../config/provinces.yml');
    const parsed = YAML.parse(fs.readFileSync(filePath, 'utf-8'));
    provinces = parsed.provinces;
  });

  it('defines exactly the 4 sOmeri factions', () => {
    const names = provinces.map((p) => p.name);
    expect(names).toEqual(['소메르 강 유역', '변경자치주', '서부 변경주', '해안 자치주']);
  });

  it('gives every province the required fields', () => {
    for (const province of provinces) {
      expect(typeof province.name).toBe('string');
      expect(typeof province.icon_name).toBe('string');
      expect(typeof province.inside_border_color).toBe('string');
      expect(typeof province.outside_border_color).toBe('string');
      expect(typeof province.start_bias).toBe('string');
      expect(typeof province.start_bias_desc).toBe('string');
      expect(Array.isArray(province.unique_unit_descs)).toBe(true);
      expect(province.unique_unit_descs.length).toBeGreaterThan(0);
      expect(Array.isArray(province.ability_descs)).toBe(true);
      expect(province.ability_descs.length).toBeGreaterThan(0);
      expect(Array.isArray(province.cities)).toBe(true);
      expect(province.cities.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate city names across provinces', () => {
    const allCities = provinces.flatMap((p) => p.cities as string[]);
    expect(new Set(allCities).size).toBe(allCities.length);
  });
});
