import test from 'node:test';
import assert from 'node:assert/strict';
import { DeviceManager, PRDeviceManager, LocalDeviceStorage, isKeyLog } from '../src/util.js';

function storageArea(data) {
    return {
        get(keys, callback) {
            if (keys == null) return callback({ ...data });
            const names = Array.isArray(keys) ? keys : [keys];
            callback(Object.fromEntries(names.filter(name => name in data).map(name => [name, data[name]])));
        },
        set(items, callback) { Object.assign(data, items); callback(); },
        remove(keys, callback) {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
            callback();
        }
    };
}

function browserStorage(syncData = {}, localData = {}) {
    globalThis.chrome = {
        runtime: { lastError: null },
        storage: { sync: storageArea(syncData), local: storageArea(localData) }
    };
    return { syncData, localData };
}

test('legacy Widevine file migrates locally and survives sync removal', async () => {
    const { syncData, localData } = browserStorage({ devices: ['phone'], phone: 'binary-data' });
    assert.deepEqual(await LocalDeviceStorage.list('widevine'), ['phone']);
    assert.equal(localData['o11keys:device:widevine:phone'], 'binary-data');
    delete syncData.phone;
    delete syncData.devices;
    assert.equal(await DeviceManager.loadWidevineDevice('phone'), 'binary-data');
});

test('removed files do not reappear from legacy sync storage', async () => {
    browserStorage({ prDevices: ['tablet'], tablet: 'old-data' });
    assert.deepEqual(await LocalDeviceStorage.list('playready'), ['tablet']);
    await PRDeviceManager.removePlayreadyDevice('tablet');
    assert.deepEqual(await LocalDeviceStorage.list('playready'), []);
    assert.equal(await PRDeviceManager.loadPlayreadyDevice('tablet'), '');
    await PRDeviceManager.savePlayreadyDevice('tablet', 'new-data');
    assert.equal(await PRDeviceManager.loadPlayreadyDevice('tablet'), 'new-data');
});

test('device entries cannot be mistaken for saved key logs', () => {
    assert.equal(isKeyLog('device-data'), false);
    assert.equal(isKeyLog(['phone']), false);
    assert.equal(isKeyLog({ pssh: 'abc', keys: [{ kid: '01', k: '02' }] }), true);
});
