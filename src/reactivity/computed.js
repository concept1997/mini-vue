import { isFunction } from '../utils';
import { effect, track, trigger } from './effect';

export function computed(getterOrOption) {
    let getter, setter;
    if (isFunction(getterOrOption)) {
        getter = getterOrOption;
        setter = () => {
            console.warn('computed is readonly');
        };
    } else {
        getter = getterOrOption.get;
        setter = getterOrOption.set;
    }
    return new ComputedImpl(getter, setter);
}

//懒计算，只有真正执行的时候才会运行 
class ComputedImpl {
    constructor(getter, setter) {
        this._setter = setter;
        this._value = undefined; //缓存它的值
        this._dirty = true; //标志依赖有没有更新
        this.effect = effect(getter, {
            lazy: true,
            scheduler: () => {
                if (!this._dirty) {
                    this._dirty = true;
                    trigger(this, 'value');
                }
            },
        });
    }

    get value() {
        if (this._dirty) {
            this._value = this.effect();
            this._dirty = false;
            track(this, 'value');
        }
        return this._value;
    }

    set value(newValue) {
        this._setter(newValue);
    }
}