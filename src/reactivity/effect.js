const effectStack = [];
let activeEffect; //全局变量记录当前正在执行的副作用函数

export function effect(fn, options = {}) {
    //1.执行副作用函数fn
    //2.执行过程中发现依赖，对响应式对象的依赖
    //3.响应式对象中进行依赖收集(proxy-get)
    //4.响应式对象发生变化时触发更新(proxy-set)
    const effectFn = () => {
        try {
            activeEffect = effectFn;
            effectStack.push(activeEffect);
            return fn();
        } finally {
            effectStack.pop();
            activeEffect = effectStack[effectStack.length - 1];
        }
    };
    if (!options.lazy) {
        effectFn();
    }
    effectFn.scheduler = options.scheduler;
    return effectFn;
}

//targetMap用于储存副作用，并建立副作用与依赖的对应关系
/*WeakMap：
{
    [target]:{//key是reactiveObject,value是一个Map
    [key]:[]//key是reactiveObject的键值，value是一个set
    }
}
*/
const targetMap = new WeakMap();
export function track(target, key) {
    if (!activeEffect) {
        return;
    }
    //保存依赖信息
    let depsMap = targetMap.get(target);
    if (!depsMap) {
        targetMap.set(target, (depsMap = new Map()));
    }

    let deps = depsMap.get(key);
    if (!deps) {
        depsMap.set(key, (deps = new Set()));
    }

    deps.add(activeEffect);
}

export function trigger(target, key) {
    const depsMap = targetMap.get(target);
    if (!depsMap) {
        return;
    }
    const deps = depsMap.get(key);
    if (!deps) {
        return;
    }
    deps.forEach((effectFn) => {
        if (effectFn.scheduler) {
            effectFn.scheduler(effectFn);
        } else {
            effectFn();
        }
    });
}