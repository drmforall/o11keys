import { WidevineDevice } from "./lib/widevine/device.js";
import { PlayReadyDevice } from "./lib/playready/device.js";
import { RemoteCdm } from "./lib/remote_cdm.js";
import { CustomHandlers } from "./lib/customhandlers/main.js";

export class AsyncSyncStorage {
    static async setStorage(items) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.set(items, () => {
                if (chrome.runtime.lastError) {
                    const msg = chrome.runtime.lastError.message;
                    if (msg.toLowerCase().includes("quota")) {
                        notifyUser("Storage quota exceeded.", "Please free up some space by removing unused devices.", true);
                    }
                    reject(new Error(msg));
                } else {
                    resolve();
                }
            });
        });
    }

    static async getStorage(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        });
    }

    static async removeStorage(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.remove(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        });
    }
}

export class AsyncLocalStorage {
    static async setStorage(items) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(items, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }

    static async getStorage(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        });
    }

    static async removeStorage(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.remove(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        });
    }
}

export class AsyncSessionStorage {
    static async setStorage(items) {
        return new Promise((resolve, reject) => {
            chrome.storage.session.set(items, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }

    static async getStorage(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.session.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        });
    }

    static async removeStorage(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.session.remove(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        });
    }
}

export function isKeyLog(value) {
    return !!value && typeof value === "object" && Array.isArray(value.keys) &&
        typeof value.pssh === "string";
}

// Device files can exceed sync quotas and Firefox Sync may remove them. Keep the
// binary files local, while leaving small profiles in sync storage.
export class LocalDeviceStorage {
    static indexKey(kind) { return `o11keys:device-index:${kind}`; }
    static itemKey(kind, name) { return `o11keys:device:${kind}:${name}`; }
    static legacyIndex(kind) { return kind === "widevine" ? "devices" : "prDevices"; }

    static async list(kind) {
        const key = this.indexKey(kind);
        const local = await AsyncLocalStorage.getStorage([key]);
        if (Array.isArray(local[key])) return local[key];

        const legacyKey = this.legacyIndex(kind);
        const legacy = await AsyncSyncStorage.getStorage([legacyKey]);
        const names = [];
        for (const name of legacy[legacyKey] || []) {
            const old = await AsyncSyncStorage.getStorage([name]);
            if (typeof old[name] !== "string" || !old[name]) continue;
            await AsyncLocalStorage.setStorage({ [this.itemKey(kind, name)]: old[name] });
            names.push(name);
        }
        await AsyncLocalStorage.setStorage({ [key]: names });
        return names;
    }

    static async save(kind, name, value) {
        const names = await this.list(kind);
        await AsyncLocalStorage.setStorage({ [this.itemKey(kind, name)]: value });
        if (!names.includes(name)) {
            await AsyncLocalStorage.setStorage({ [this.indexKey(kind)]: [...names, name] });
        }
    }

    static async load(kind, name) {
        if (!name) return "";
        const key = this.itemKey(kind, name);
        const local = await AsyncLocalStorage.getStorage([key]);
        if (Object.prototype.hasOwnProperty.call(local, key)) return local[key] || "";
        const legacy = await AsyncSyncStorage.getStorage([name]);
        if (legacy[name]) {
            await this.save(kind, name, legacy[name]);
            return legacy[name];
        }
        return "";
    }

    static async remove(kind, name) {
        const names = await this.list(kind);
        // A tombstone prevents a migrated sync copy from restoring a removed file.
        await AsyncLocalStorage.setStorage({ [this.itemKey(kind, name)]: "" });
        await AsyncLocalStorage.setStorage({ [this.indexKey(kind)]: names.filter(item => item !== name) });
    }
}

export class DeviceManager {
    static async saveWidevineDevice(name, value) {
        await LocalDeviceStorage.save("widevine", name, value);
    }

    static async loadWidevineDevice(name) {
        return LocalDeviceStorage.load("widevine", name);
    }

    static setWidevineDevice(name, value) {
        const wvdCombobox = document.getElementById('wvd-combobox');
        const wvdElement = document.createElement('option');

        const wvdRemove = document.getElementById('remove');
        const wvdDownload = document.getElementById('download');

        wvdElement.text = name;
        wvdElement.value = value;

        wvdCombobox.appendChild(wvdElement);

        wvdRemove.disabled = false;
        wvdDownload.disabled = false;
    }

    static async loadSetAllWidevineDevices() {
        const array = await LocalDeviceStorage.list("widevine");
        for (const item of array) {
            this.setWidevineDevice(item, await this.loadWidevineDevice(item));
        }
    }

    static async saveGlobalSelectedWidevineDevice(name) {
        const config = await SettingsManager.getProfile();
        config.widevine.device.local = name;
        await SettingsManager.setProfile("global", config);
    }

    static async getSelectedWidevineDevice(scope) {
        const config = await SettingsManager.getProfile(scope);
        return config.widevine?.device?.local || "";
    }

    static async selectWidevineDevice(name) {
        document.getElementById('wvd-combobox').value = await this.loadWidevineDevice(name);
    }

    static async removeWidevineDevice(name) {
        await LocalDeviceStorage.remove("widevine", name);
    }
}

export class PRDeviceManager {
    static async savePlayreadyDevice(name, value) {
        await LocalDeviceStorage.save("playready", name, value);
    }

    static async loadPlayreadyDevice(name) {
        return LocalDeviceStorage.load("playready", name);
    }

    static setPlayreadyDevice(name, value){
        const prdCombobox = document.getElementById('prd-combobox');
        const prdElement = document.createElement('option');

        const prdRemove = document.getElementById('prdRemove');
        const prdDownload = document.getElementById('prdDownload');

        prdElement.text = name;
        prdElement.value = value;

        prdCombobox.appendChild(prdElement);

        prdRemove.disabled = false;
        prdDownload.disabled = false;
    }

    static async loadSetAllPlayreadyDevices() {
        const array = await LocalDeviceStorage.list("playready");
        for (const item of array) {
            this.setPlayreadyDevice(item, await this.loadPlayreadyDevice(item));
        }
    }

    static async saveGlobalSelectedPlayreadyDevice(name) {
        const config = await SettingsManager.getProfile("global");
        config.playready.device.local = name;
        await SettingsManager.setProfile("global", config);
    }

    static async getSelectedPlayreadyDevice(scope) {
        const config = await SettingsManager.getProfile(scope);
        return config.playready?.device?.local || "";
    }

    static async selectPlayreadyDevice(name) {
        document.getElementById('prd-combobox').value = await this.loadPlayreadyDevice(name);
    }

    static async removePlayreadyDevice(name) {
        await LocalDeviceStorage.remove("playready", name);
    }
}

export class RemoteCDMManager {
    static async saveRemoteCDM(name, obj) {
        const result = await AsyncSyncStorage.getStorage(['remote_cdms']);
        const array = result.remote_cdms === undefined ? [] : result.remote_cdms;
        if (!array.includes(name)) {
            array.push(name);
        }
        await AsyncSyncStorage.setStorage({ remote_cdms: array });
        await AsyncSyncStorage.setStorage({ [name]: obj });
    }

    static async loadRemoteCDM(name) {
        const result = await AsyncSyncStorage.getStorage([name ?? ""]);
        return JSON.stringify(result[name] || {});
    }

    static setRemoteCDM(name, value, only) {
        const remoteCombobox = document.getElementById('remote-combobox');
        const prRemoteCombobox = document.getElementById('pr-remote-combobox');
        const remoteElement = document.createElement('option');

        const remoteRemove = document.getElementById('remoteRemove');
        const remoteDownload = document.getElementById('remoteDownload');
        const prRemoteRemove = document.getElementById('prRemoteRemove');
        const prRemoteDownload = document.getElementById('prRemoteDownload');

        remoteElement.text = name;
        remoteElement.value = value;

        const parsed = JSON.parse(value);
        const type = parsed.type || "WIDEVINE";
        if (only && type !== only) return;
        if (type === "PLAYREADY") {
            prRemoteCombobox.appendChild(remoteElement);
            prRemoteRemove.disabled = false;
            prRemoteDownload.disabled = false;
        } else {
            remoteCombobox.appendChild(remoteElement);
            remoteRemove.disabled = false;
            remoteDownload.disabled = false;
        }
    }

    static async loadSetAllRemoteCDMs() {
        const result = await AsyncSyncStorage.getStorage(['remote_cdms']);
        const array = result.remote_cdms || [];
        for (const item of array) {
            this.setRemoteCDM(item, await this.loadRemoteCDM(item));
        }
    }

    static async loadSetWVRemoteCDMs() {
        const result = await AsyncSyncStorage.getStorage(['remote_cdms']);
        const array = result.remote_cdms || [];
        for (const item of array) {
            this.setRemoteCDM(item, await this.loadRemoteCDM(item), "WIDEVINE");
        }
    }

    static async loadSetPRRemoteCDMs() {
        const result = await AsyncSyncStorage.getStorage(['remote_cdms']);
        const array = result.remote_cdms || [];
        for (const item of array) {
            this.setRemoteCDM(item, await this.loadRemoteCDM(item), "PLAYREADY");
        }
    }

    static async saveGlobalSelectedRemoteCDM(name) {
        const config = await SettingsManager.getProfile("global");
        config.widevine.device.remote = name;
        await SettingsManager.setProfile("global", config);
    }

    static async saveGlobalSelectedPRRemoteCDM(name) {
        const config = await SettingsManager.getProfile("global");
        config.playready.device.remote = name;
        await SettingsManager.setProfile("global", config);
    }

    static async getSelectedRemoteCDM(scope) {
        const config = await SettingsManager.getProfile(scope);
        return config.widevine?.device?.remote || "";
    }

    static async getSelectedPRRemoteCDM(scope) {
        const config = await SettingsManager.getProfile(scope);
        return config.playready?.device?.remote || "";
    }

    static async selectRemoteCDM(name) {
        document.getElementById('remote-combobox').value = await this.loadRemoteCDM(name);
    }

    static async selectPRRemoteCDM(name) {
        document.getElementById('pr-remote-combobox').value = await this.loadRemoteCDM(name);
    }

    static async removeRemoteCDM(name) {
        const result = await AsyncSyncStorage.getStorage(['remote_cdms']);
        const array = result.remote_cdms === undefined ? [] : result.remote_cdms;

        const index = array.indexOf(name);
        if (index > -1) {
            array.splice(index, 1);
        }

        await AsyncSyncStorage.setStorage({ remote_cdms: array });
        await AsyncSyncStorage.removeStorage([name]);
    }
}

export class CustomHandlerManager {
    static loadSetAllCustomHandlers() {
        const customSelect = document.getElementById('customSelect');
        const customCombobox = document.getElementById('custom-combobox');
        const customDesc = document.getElementById('custom-desc');
        const prCustomSelect = document.getElementById('prCustomSelect');
        const prCustomCombobox = document.getElementById('pr-custom-combobox');
        const prCustomDesc = document.getElementById('pr-custom-desc');

        for (const handler in CustomHandlers) {
            const option = document.createElement('option');
            option.text = CustomHandlers[handler].name;
            option.value = handler;
            option.hidden = CustomHandlers[handler].disabled;
            if (["widevine", undefined].includes(CustomHandlers[handler].for)) {
                customCombobox.appendChild(option);
                if (!option.hidden) {
                    customSelect.classList.remove('hidden');
                }
            }
            if (["playready", undefined].includes(CustomHandlers[handler].for)) {
                prCustomCombobox.appendChild(option.cloneNode(true));
                if (!option.hidden) {
                    prCustomSelect.classList.remove('hidden');
                }
            }
        }

        customDesc.innerHTML = CustomHandlers[customCombobox.value]?.description || "";
        prCustomDesc.innerHTML = CustomHandlers[prCustomCombobox.value]?.description || "";
    }

    static selectCustomHandler(name) {
        if (!name) return;
        const customCombobox = document.getElementById('custom-combobox');
        const customDesc = document.getElementById('custom-desc');

        if (CustomHandlers[name]?.handler && CustomHandlers[name]?.for !== "playready") {
            customCombobox.value = name;
            customDesc.textContent = CustomHandlers[name]?.description || "";
        } else {
            const option = new Option("Invalid handler: " + name, name, true, true);
            option.hidden = true;
            customCombobox.appendChild(option);
            customDesc.textContent = "This handler is not available in this build of o11keys. Please ensure that you have the same version of o11keys in all browsers with syncing enabled.";
        }
    }

    static selectPRCustomHandler(name) {
        if (!name) return;
        const prCustomCombobox = document.getElementById('pr-custom-combobox');
        const prCustomDesc = document.getElementById('pr-custom-desc');

        if (CustomHandlers[name]?.handler && CustomHandlers[name]?.for !== "widevine") {
            prCustomCombobox.value = name;
            prCustomDesc.textContent = CustomHandlers[name]?.description || "";
        } else {
            const option = new Option("Invalid handler: " + name, name, true, true);
            option.hidden = true;
            prCustomCombobox.appendChild(option);
            prCustomDesc.textContent = "This handler is not available in this build of o11keys. Please ensure that you have the same version of o11keys in all browsers with syncing enabled.";
        }
    }
}

export class SettingsManager {
    static async getProfile(scope = "global") {
        const result = await AsyncSyncStorage.getStorage([scope ?? "global"]);
        if (result[scope] === undefined) {
            if (scope !== "global") {
                return await this.getProfile("global");
            }
            return {
                "enabled": true,
                "widevine": {
                    "enabled": true,
                    "device": {
                        "local": null,
                        "remote": null,
                        "custom": "knownkeys"
                    },
                    "type": "local",
                    "serverCert": "if_provided",
                    "robustness": "HW_SECURE_ALL"
                },
                "playready": {
                    "enabled": true,
                    "device": {
                        "local": null,
                        "remote": null,
                        "custom": null
                    },
                    "type": "local",
                    "allowSL3K": true
                },
                "clearkey": {
                    "enabled": true
                },
                "hdcp": 9,
                "blockDisabled": false,
                "allowPersistence": false
            }
        }
        return result[scope];
    }

    static async setProfile(scope, config) {
        await AsyncSyncStorage.setStorage({ [scope]: config });
    }

    static async removeProfile(scope) {
        if (!scope || scope === "global") {
            return;
        }
        await AsyncSyncStorage.removeStorage([scope]);
    }

    static async profileExists(scope) {
        const result = await AsyncSyncStorage.getStorage([scope ?? "global"]);
        return result[scope] !== undefined;
    }

    static async getGlobalEnabled() {
        const config = await SettingsManager.getProfile("global");
        return config.enabled;
    }

    static async setGlobalEnabled(enabled) {
        const config = await SettingsManager.getProfile("global");
        config.enabled = enabled;
        setIcon(`images/icon${enabled ? '' : '-disabled'}.png`);
        if (enabled) {
            await ScriptManager.registerContentScript();
        } else {
            await ScriptManager.unregisterContentScript();
        }
        await SettingsManager.setProfile("global", config);
    }

    static downloadFile(content, filename) {
        const blob = new Blob([content], { type: filename.endsWith('.json') ? 'application/json;charset=utf-8' : 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    static async importDevice(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function (loaded) {
                const result = loaded.target.result;

                try {
                    const widevineDevice = new WidevineDevice(result);
                    const b64Device = uint8ArrayToBase64(new Uint8Array(result));
                    const deviceName = widevineDevice.getName();

                    if (!await DeviceManager.loadWidevineDevice(deviceName) ||
                        (window.resizeTo(800, 600), window.confirm(`Widevine device "${deviceName}" already exists. Overwrite?`))
                    ) {
                        await DeviceManager.saveWidevineDevice(deviceName, b64Device);
                    }

                    await DeviceManager.saveGlobalSelectedWidevineDevice(deviceName);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = function (error) {
                reject(error);
            };
            reader.readAsArrayBuffer(file);
        });
    }

    static async loadRemoteCDM(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function (loaded) {
                const result = loaded.target.result;

                try {
                    const jsonFile = JSON.parse(result);

                    if (!jsonFile.host && !jsonFile.sg_api_conf) {
                        throw new Error("Invalid remote CDM file: missing host on non-SuperGeneric device");
                    }

                    console.log("LOADED DEVICE:", jsonFile);
                    const remoteCdm = new RemoteCdm(jsonFile);
                    const deviceName = remoteCdm.getName();
                    console.log("NAME:", deviceName);

                    if (await RemoteCDMManager.loadRemoteCDM(deviceName) === "{}" ||
                        (window.resizeTo(800, 600), window.confirm(`Remote CDM "${deviceName}" already exists. Overwrite?`))
                    ) {
                        await RemoteCDMManager.saveRemoteCDM(deviceName, jsonFile);
                    }

                    if (jsonFile.type === "PLAYREADY") {
                        await RemoteCDMManager.saveGlobalSelectedPRRemoteCDM(deviceName);
                    } else {
                        await RemoteCDMManager.saveGlobalSelectedRemoteCDM(deviceName);
                    }
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = function (error) {
                reject(error);
            };
            reader.readAsText(file);
        });
    }
    
    static async importPRDevice(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function (loaded) {
                const result = loaded.target.result;

                try {
                    new PlayReadyDevice(new Uint8Array(result)); // Test if valid PlayReady device
                    const b64Device = uint8ArrayToBase64(new Uint8Array(result));
                    const deviceName = file.name.slice(0, -4);

                    if (!await PRDeviceManager.loadPlayreadyDevice(deviceName) || 
                        (window.resizeTo(800, 600), window.confirm(`PlayReady device "${deviceName}" already exists. Overwrite?`))
                    ) {
                        await PRDeviceManager.savePlayreadyDevice(deviceName, b64Device);
                    }

                    await PRDeviceManager.saveGlobalSelectedPlayreadyDevice(deviceName);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = function (error) {
                reject(error);
            };
            reader.readAsArrayBuffer(file);
        });
    }

    static setSelectedDeviceType(deviceType) {
        switch (deviceType) {
            case "local":
                const wvdSelect = document.getElementById('wvdSelect');
                wvdSelect.checked = true;
                break;
            case "remote":
                const remoteSelect = document.getElementById('remoteSelect');
                remoteSelect.checked = true;
                break;
            case "custom":
                const customSelect = document.getElementById('customSelect');
                customSelect.checked = true;
        }
    }

    static setSelectedPRDeviceType(deviceType) {
        switch (deviceType) {
            case "local":
                const prdSelect = document.getElementById('prdSelect');
                prdSelect.checked = true;
                break;
            case "remote":
                const remoteSelect = document.getElementById('prRemoteSelect');
                remoteSelect.checked = true;
                break;
            case "custom":
                const customSelect = document.getElementById('prCustomSelect');
                customSelect.checked = true;
        }
    }

    static async saveExecutableName(exeName) {
        await AsyncSyncStorage.setStorage({ exe_name: exeName });
    }

    static async getExecutableName() {
        const result = await AsyncSyncStorage.getStorage(["exe_name"]);
        return result["exe_name"] ?? "N_m3u8DL-RE";
    }
    
    static async saveCommandOptions(opts) {
        await AsyncSyncStorage.setStorage({ commandOptions: opts });
    }

    static async getCommandOptions() {
        const result = await AsyncSyncStorage.getStorage(['commandOptions']);
        return result.commandOptions || {};
    }

    static async getUICollapsed() {
        const result = await AsyncSyncStorage.getStorage(['uiCollapsed']);
        return result.uiCollapsed || { devicesCollapsed: false, commandsCollapsed: true, advancedCollapsed: true };
    }

    static async setUICollapsed(devicesCollapsed, commandsCollapsed, advancedCollapsed) {
        const value = { devicesCollapsed, commandsCollapsed, advancedCollapsed };
        await AsyncSyncStorage.setStorage({ uiCollapsed: value });
    }
}

export class ScriptManager {
    static id = "vl-content";

    static async registerContentScript() {
        const existing = await chrome.scripting.getRegisteredContentScripts({
            ids: [this.id]
        });
        if (existing?.length) {
            return;
        }

        await chrome.scripting.registerContentScripts([{
            id: this.id,
            js: ['/content_script.js'],
            matches: ['*://*/*', 'file://*/*'],
            runAt: 'document_start',
            world: 'MAIN',
            allFrames: true,
            matchOriginAsFallback: true,
            persistAcrossSessions: true
        }]);
    }

    static async unregisterContentScript() {
        try {
            await chrome.scripting.unregisterContentScripts({
                ids: [this.id]
            });
        } catch {
            // not registered
        }
    }
}

export function intToUint8Array(num) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, num, false);
    return new Uint8Array(buffer);
}

export function compareUint8Arrays(arr1, arr2) {
    if (arr1.length !== arr2.length)
        return false;
    return Array.from(arr1).every((value, index) => value === arr2[index]);
}

export function uint8ArrayToHex(buffer) {
    return Array.prototype.map.call(buffer, x => x.toString(16).padStart(2, '0')).join('');
}

export function hexToUint8Array(hex) {
    if (typeof hex !== 'string' || hex.length % 2 !== 0)
        throw new Error("Invalid hex string");

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

export function uint8ArrayToString(uint8array) {
    return String.fromCharCode.apply(null, uint8array)
}

export function uint8ArrayToBase64(uint8array) {
    return btoa(String.fromCharCode.apply(null, uint8array));
}

export function base64toUint8Array(base64String){
    return Uint8Array.from(atob(base64String), c => c.charCodeAt(0))
}

export function stringToUint8Array(string) {
    return Uint8Array.from(string.split("").map(x => x.charCodeAt()))
}

export function stringToHex(string){
    return string.split("").map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

export function flipUUIDByteOrder(u8arr) {
    const out = new Uint8Array(16);
    out.set([
        u8arr[3], u8arr[2], u8arr[1], u8arr[0], // 4 bytes reversed
        u8arr[5], u8arr[4],                     // 2 bytes reversed
        u8arr[7], u8arr[6],                     // 2 bytes reversed
        ...u8arr.slice(8)                       // last 8 bytes unchanged
    ]);
    return out;
}

// Some services send WV+PR concatenated PSSH to generateRequest
export function getWvPsshFromConcatPssh(psshBase64) {
    const raw = base64toUint8Array(psshBase64);

    let offset = 0;
    while (offset + 8 <= raw.length) {
        const size = new DataView(raw.buffer, raw.byteOffset + offset).getUint32(0);
        if (size === 0 || offset + size > raw.length) break;

        const box = raw.slice(offset, offset + size);
        const boxType = String.fromCharCode(...box.slice(4, 8));
        const systemId = [...box.slice(12, 28)]
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        if (boxType === 'pssh' && systemId === 'edef8ba979d64acea3c827dcd51d21ed') {
            return uint8ArrayToBase64(box);
        }

        offset += size;
    }

    return psshBase64;
}

export async function setIcon(filename, tabId = undefined) {
    const url = chrome.runtime.getURL(filename);
    const res = await fetch(url);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

    chrome.action.setIcon({
        imageData: {
            [bitmap.width]: imageData
        },
        ...(tabId ? { tabId } : {})
    });
}

export async function setBadgeText(text, tabId = undefined) {
    let color = "#2169eb";
    const prev = await getBadgeText(tabId);
    if (prev === text) return;
    if (text === "-") {
        color = "#ffdf00";
    } else if (["WV", "PR", "CK"].includes(prev)) {
        text = "+"; // indicate multiple CDMs in use
    }
    chrome.action.setBadgeText({
        text,
        ...(tabId ? { tabId } : {})
    });
    chrome.action.setBadgeBackgroundColor({ color, ...(tabId ? { tabId } : {}) });
}

export async function getBadgeText(tabId = undefined) {
    return await chrome.action.getBadgeText({
        ...(tabId ? { tabId } : {})
    });
}

export async function getForegroundTab() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs.length > 0) {
                resolve(tabs[0]);
            }
        });
    });
}

export async function openPopup(url, width, height) {
    const options = { url };
    if (!chrome.windows?.create || navigator.userAgent.includes("Android") || navigator.userAgent.includes("iPhone OS")) {
        options.active = true;
        return await chrome.tabs.create(options);
    }
    options.type = 'popup';
    options.width = width;
    options.height = height;
    return await chrome.windows.create(options);
}

export function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

export function notifyUser(title, message, noConsoleLog) {
    if (!noConsoleLog) {
        console.error(`[o11keys] ${title}: ${message}`);
    }

    if (chrome.notifications?.create) {
        const id = Date.now().toString();
        chrome.notifications.create(id, {
            type: "basic",
            iconUrl: chrome.runtime.getURL("images/icon.png"),
            title: title,
            message: message
        });
        chrome.notifications.onClicked.addListener((notificationId) => {
            if (notificationId === id) {
                const url = `pages/errview/errview.html?title=${encodeURIComponent(title)}&message=${encodeURIComponent(message)}`;
                openPopup(url, 640, 480);
            }
        });
    } else if (self.alert) {
        alert(message);
    }
}
