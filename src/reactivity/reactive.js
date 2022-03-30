import { isObject, hasChanged, isArray } from '../utils';
import { track, trigger } from './effect';

//为了特例:两个同样响应式对象obj存储
const reactiveMap = new WeakMap();
export function reactive(target) {
    //判断是否是对象或数组才进行响应式
    if (!isObject(target)) { return target; }
    if (isReactive(target)) { return target; }
    if (reactiveMap.has(target)) { return reactiveMap.get(target); }

    const proxy = new Proxy(target, {
        get(target, key, receiver) {
            if (key === '__isReactive') {
                return true;
            }
            track(target, key);
            const res = Reflect.get(target, key, receiver);
            //特例处理4：深层对象代理，只有真正的响应式对象才代理
            return isObject(res) ? reactive(res) : res;
        },
        set(target, key, value, receiver) {
            //处理特例，isChanged
            const oldValue = target[key];
            const oldLength = target.length;
            const res = Reflect.set(target, key, value, receiver);
            if (hasChanged(value, oldValue)) {
                trigger(target, key);
                if (isArray(target) && target.length !== oldLength) {
                    trigger(target, 'length');
                }
            }
            return res;
        },
    });
    reactiveMap.set(target, proxy);
    return proxy;
}

export function isReactive(target) {
    //特例：reactive(reactive(obj))
    return !!(target && target.__isReactive);
}