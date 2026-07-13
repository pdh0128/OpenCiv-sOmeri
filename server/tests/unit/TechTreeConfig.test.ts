import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

describe('eras.yml and technologies.yml', () => {
  let eras: Record<string, any>[];
  let technologies: Record<string, any>[];

  beforeAll(() => {
    const erasPath = path.join(__dirname, '../../config/eras.yml');
    const techPath = path.join(__dirname, '../../config/technologies.yml');
    eras = YAML.parse(fs.readFileSync(erasPath, 'utf-8')).eras;
    technologies = YAML.parse(fs.readFileSync(techPath, 'utf-8')).technologies;
  });

  it('defines exactly 10 eras with sequential order 1-10', () => {
    expect(eras.length).toBe(10);
    const orders = eras.map((e) => e.order).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('gives every era a unique id and non-empty name', () => {
    const ids = eras.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const era of eras) {
      expect(typeof era.name).toBe('string');
      expect(era.name.length).toBeGreaterThan(0);
    }
  });

  it('defines exactly 13 technologies', () => {
    expect(technologies.length).toBe(13);
  });

  it('references only valid era ids', () => {
    const eraIds = new Set(eras.map((e) => e.id));
    for (const tech of technologies) {
      expect(eraIds.has(tech.era)).toBe(true);
    }
  });

  it('references only valid prerequisite technology ids', () => {
    const techIds = new Set(technologies.map((t) => t.id));
    for (const tech of technologies) {
      for (const prereq of tech.prerequisites) {
        expect(techIds.has(prereq)).toBe(true);
      }
    }
  });

  it('has no cycles in the prerequisite graph', () => {
    const byId = new Map(technologies.map((t) => [t.id, t]));
    const visiting = new Set<string>();
    const visited = new Set<string>();

    function visit(id: string) {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`Cycle detected at ${id}`);
      visiting.add(id);
      for (const prereq of byId.get(id)!.prerequisites) {
        visit(prereq);
      }
      visiting.delete(id);
      visited.add(id);
    }

    expect(() => {
      for (const tech of technologies) visit(tech.id);
    }).not.toThrow();
  });

  it('leaves dark_age with zero technologies, intentionally', () => {
    const darkAgeTechs = technologies.filter((t) => t.era === 'dark_age');
    expect(darkAgeTechs.length).toBe(0);
  });

  it('gives every technology a positive numeric research_cost', () => {
    for (const tech of technologies) {
      expect(typeof tech.research_cost).toBe('number');
      expect(tech.research_cost).toBeGreaterThan(0);
    }
  });
});
