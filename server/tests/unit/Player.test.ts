import { WebSocket } from 'ws';
import { Player } from '../../src/Player';

jest.mock('../../src/Events');
jest.mock('../../src/Game', () => ({
  Game: { getInstance: () => ({ getPlayers: () => new Map() }) }
}));

function fakeWebSocket(): jest.Mocked<WebSocket> {
  return { on: jest.fn(), send: jest.fn() } as unknown as jest.Mocked<WebSocket>;
}

const fakeProvince = {
  name: '해안 자치주',
  icon_name: 'MAMLUKS_ICON',
  cities: ['항구성', '교역', '자치항']
};

describe('Player', () => {
  it('stores and returns province data', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    expect(player.getProvinceData()).toBe(fakeProvince);
  });

  it('serializes provinceData under the "provinceData" key in toJSON', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    const json = player.toJSON();
    expect(json).toEqual({
      name: 'Player1',
      provinceData: fakeProvince,
      requestedNextTurn: false
    });
  });

  it('returns the first unused city name from the province pool', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    expect(player.getNextAvailableCityName()).toBe('항구성');
  });

  it('skips city names already taken by this player\'s existing cities', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    (player as any).cities = [{ getName: () => '항구성' }, { getName: () => '교역' }];
    expect(player.getNextAvailableCityName()).toBe('자치항');
  });

  it('returns MAX_CITIES_REACHED once every pool name is used', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    (player as any).cities = fakeProvince.cities.map((name) => ({ getName: () => name }));
    expect(player.getNextAvailableCityName()).toBe('MAX_CITIES_REACHED');
  });
});
