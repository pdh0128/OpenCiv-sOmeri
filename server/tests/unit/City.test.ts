import { City } from '../../src/city/City';
import { GameMap } from '../../src/map/GameMap';
import { Tile } from '../../src/map/Tile';
import { Player } from '../../src/Player';
import { ServerEvents } from '../../src/Events';
import { Game } from '../../src/Game';

jest.mock('../../src/map/GameMap');
jest.mock('../../src/Player');
jest.mock('../../src/Events');
jest.mock('../../src/Game');

describe('City production queue', () => {
  let city: City;
  let mockTile: jest.Mocked<Tile>;
  let mockWorkedTile: jest.Mocked<Tile>;
  let mockPlayer: jest.Mocked<Player>;
  let getBuildingDataByName: jest.Mock;

  const granaryData = {
    name: 'Granary',
    asset_name: 'BUILDING_PALACE',
    production_cost: 12,
    stats: [{ food: 2 }]
  };

  const palaceData = {
    name: 'Palace',
    asset_name: 'BUILDING_PALACE',
    production_cost: 0,
    stats: [{ science: 3 }, { production: 3 }, { gold: 2 }, { defense: 2 }, { culture: 1 }]
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTile = {
      getX: jest.fn().mockReturnValue(0),
      getY: jest.fn().mockReturnValue(0),
      getAdjacentTiles: jest.fn().mockReturnValue([]),
      getStats: jest.fn().mockReturnValue([])
    } as unknown as jest.Mocked<Tile>;

    mockWorkedTile = {
      getX: jest.fn().mockReturnValue(1),
      getY: jest.fn().mockReturnValue(0),
      getStats: jest.fn().mockReturnValue([])
    } as unknown as jest.Mocked<Tile>;

    mockPlayer = {
      getName: jest.fn().mockReturnValue('TestPlayer'),
      getNextAvailableCityName: jest.fn().mockReturnValue('TestCity'),
      sendNetworkEvent: jest.fn()
    } as unknown as jest.Mocked<Player>;

    jest.spyOn(GameMap, 'getInstance').mockReturnValue({
      getTileWithHighestYeild: jest.fn().mockReturnValue(mockWorkedTile)
    } as any);

    getBuildingDataByName = jest.fn().mockImplementation((name: string) => {
      if (name.toLowerCase() === 'granary') return granaryData;
      if (name.toLowerCase() === 'palace') return palaceData;
      return undefined;
    });

    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({ getBuildingDataByName })
    } as any);

    jest.spyOn(ServerEvents, 'on').mockImplementation(() => {});

    city = new City({ tile: mockTile, player: mockPlayer });
  });

  it('queueBuilding sets currentlyBuilding for a valid, not-yet-built building', () => {
    city.queueBuilding('Granary');
    expect(city.getCurrentlyBuilding()).toBe('Granary');
  });

  it('queueBuilding ignores an unknown building name', () => {
    city.queueBuilding('Nonexistent');
    expect(city.getCurrentlyBuilding()).toBeUndefined();
  });

  it('queueBuilding ignores a building that is already built', () => {
    city.addBuilding('Granary');
    city.queueBuilding('Granary');
    expect(city.getCurrentlyBuilding()).toBeUndefined();
  });

  it('queueBuilding rejects a building with production_cost <= 0, like Palace, even if not yet built', () => {
    city.queueBuilding('Palace');
    expect(city.getCurrentlyBuilding()).toBeUndefined();
  });

  it('processProductionTurn accumulates progress without completing below cost', () => {
    city.queueBuilding('Granary');
    jest.spyOn(city, 'getStatline').mockReturnValue({ production: 5 } as any);

    city.processProductionTurn();

    expect(city.getProductionProgress()).toBe(5);
    expect(city.getCurrentlyBuilding()).toBe('Granary');
    expect(city.getBuildings().length).toBe(0);
  });

  it('processProductionTurn completes the building once cost is reached, carrying overflow', () => {
    city.queueBuilding('Granary'); // cost 12
    jest.spyOn(city, 'getStatline').mockReturnValue({ production: 8 } as any);

    city.processProductionTurn(); // progress 8, below cost
    city.processProductionTurn(); // progress 16 >= 12 -> completes, overflow 4

    expect(city.getBuildings().length).toBe(1);
    expect(city.getBuildings()[0].name).toBe('Granary');
    expect(city.getCurrentlyBuilding()).toBeUndefined();
    expect(city.getProductionProgress()).toBe(4);
  });

  it('processProductionTurn does nothing when nothing is queued', () => {
    jest.spyOn(city, 'getStatline').mockReturnValue({ production: 10 } as any);

    city.processProductionTurn();

    expect(city.getProductionProgress()).toBe(0);
    expect(city.getBuildings().length).toBe(0);
  });
});
