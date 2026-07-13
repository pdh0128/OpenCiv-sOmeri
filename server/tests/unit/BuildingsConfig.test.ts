import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

describe('buildings.yml', () => {
  let buildings: Record<string, any>[];

  beforeAll(() => {
    const filePath = path.join(__dirname, '../../config/buildings.yml');
    const parsed = YAML.parse(fs.readFileSync(filePath, 'utf-8'));
    buildings = parsed.buildings;
  });

  it('gives every building a numeric production_cost', () => {
    for (const building of buildings) {
      expect(typeof building.production_cost).toBe('number');
      expect(building.production_cost).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps Palace at production_cost 0 (auto-granted, not manually queueable)', () => {
    const palace = buildings.find((b) => b.name === 'Palace');
    expect(palace).toBeDefined();
    expect(palace!.production_cost).toBe(0);
  });

  it('defines a Granary that can actually be queued', () => {
    const granary = buildings.find((b) => b.name === 'Granary');
    expect(granary).toBeDefined();
    expect(granary!.production_cost).toBeGreaterThan(0);
    expect(Array.isArray(granary!.stats)).toBe(true);
  });

  it('gates Granary behind researching irrigation', () => {
    const granary = buildings.find((b) => b.name === 'Granary');
    expect(granary!.unlocked_by).toBe('irrigation');
  });

  it('leaves Palace with no unlock requirement (auto-granted)', () => {
    const palace = buildings.find((b) => b.name === 'Palace');
    expect(palace!.unlocked_by).toBeUndefined();
  });
});
