import { effect, ref, reactive } from "./reactivity";

const foo = (window.foo = ref(1));
effect(() => {
    console.log('foo:', foo.value)
})