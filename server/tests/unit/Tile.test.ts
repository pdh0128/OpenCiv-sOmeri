import { Tile } from '../../src/map/Tile';

describe('Tile visited tracking', () => {
  it('starts unvisited', () => {
    const tile = new Tile('grass', 0, 0);
    expect(tile.isVisited()).toBe(false);
  });

  it('becomes visited after markVisited', () => {
    const tile = new Tile('grass', 0, 0);
    tile.markVisited();
    expect(tile.isVisited()).toBe(true);
  });

  it('stays visited if markVisited is called again', () => {
    const tile = new Tile('grass', 0, 0);
    tile.markVisited();
    tile.markVisited();
    expect(tile.isVisited()).toBe(true);
  });
});
