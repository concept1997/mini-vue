import { ElementTypes, NodeTypes } from './ast';
import { capitalize } from '../utils';
//生成函数
export function generate(ast) {
    const returns = traverseNode(ast);
    const code = `
with (ctx) {
    const { h, Text, Fragment, renderList, resolveComponent, withModel } = MiniVue
    return ${returns}
}`;
    return code;
}
//遍历node节点
export function traverseNode(node, parent) {
    switch (node.type) {
        //根节点
        case NodeTypes.ROOT:
            if (node.children.length === 1) {
                //递归子节点
                return traverseNode(node.children[0], node);
            }
            const result = traverseChildren(node);
            return node.children.length > 1 ? `[${result}]` : result;
        case NodeTypes.ELEMENT:
            return resolveElementASTNode(node, parent);
        case NodeTypes.TEXT:
            return createTextVNode(node);
        case NodeTypes.INTERPOLATION:
            return createTextVNode(node.content);
    }
}

function traverseChildren(node) {
    const { children } = node;

    if (children.length === 1) {
        const child = children[0];
        if (child.type === NodeTypes.TEXT) {
            return createText(child);
        }
        if (child.type === NodeTypes.INTERPOLATION) {
            return createText(child.content);
        }
    }

    const results = [];
    //多个子节点就递归traverseNode
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        results.push(traverseNode(child, node));
    }

    return results.join(', ');
}

// 这里parent是必然存在的
function resolveElementASTNode(node, parent) {
    const ifNode =
        pluck(node.directives, 'if') || pluck(node.directives, 'else-if');

    if (ifNode) {
        // 递归必须用resolveElementASTNode，因为一个元素可能有多个指令
        // 所以处理指令时，移除当下指令也是必须的
        const consequent = resolveElementASTNode(node, parent);
        let alternate;

        // 如果有ifNode，则需要看它的下一个元素节点是否有else-if或else
        const { children } = parent;
        let i = children.findIndex((child) => child === node) + 1;
        for (; i < children.length; i++) {
            const sibling = children[i];

            // <div v-if="ok"/> <p v-else-if="no"/> <span v-else/>
            // 为了处理上面的例子，需要将空节点删除
            // 也因此，才需要用上for循环
            if (sibling.type === NodeTypes.TEXT && !sibling.content.trim()) {
                children.splice(i, 1);
                i--;
                continue;
            }

            if (
                sibling.type === NodeTypes.ELEMENT &&
                (pluck(sibling.directives, 'else') ||
                    // else-if 既是上一个条件语句的 alternate，又是新语句的 condition
                    // 因此pluck时不删除指令，下一次循环时当作ifNode处理
                    pluck(sibling.directives, 'else-if', false))
            ) {
                alternate = resolveElementASTNode(sibling, parent);
                children.splice(i, 1);
            }
            // 只用向前寻找一个相临的元素，因此for循环到这里可以立即退出
            break;
        }

        const { exp } = ifNode;
        return `${exp.content} ? ${consequent} : ${alternate || createTextVNode()}`;
    }

    const forNode = pluck(node.directives, 'for');
    if (forNode) {
        const { exp } = forNode;
        const [args, source] = exp.content.split(/\sin\s|\sof\s/);
        return `h(Fragment, null, renderList(${source.trim()}, ${args.trim()} => ${resolveElementASTNode(
      node
    )}))`;
    }

    return createElementVNode(node);
}

function createElementVNode(node) {
    const { children, directives } = node;

    const tag =
        node.tagType === ElementTypes.ELEMENT ?
        `"${node.tag}"` :
        `resolveComponent("${node.tag}")`;

    //prop arr数组
    const propArr = createPropArr(node);
    let propStr = propArr.length ? `{ ${propArr.join(', ')} }` : 'null';

    const vModel = pluck(directives, 'model');
    if (vModel) {
        const getter = `() => ${createText(vModel.exp)}`;
        const setter = `value => ${createText(vModel.exp)} = value`;
        propStr = `withModel(${tag}, ${propStr}, ${getter}, ${setter})`;
    }
    //props
    if (!children.length) {
        if (propStr === 'null') {
            return `h(${tag})`;
        }
        return `h(${tag}, ${propStr})`;
    }

    let childrenStr = traverseChildren(node);
    if (children[0].type === NodeTypes.ELEMENT) {
        childrenStr = `[${childrenStr}]`;
    }
    return `h(${tag}, ${propStr}, ${childrenStr})`;
}

//props
function createPropArr(node) {
    //属性和指令
    const { props, directives } = node;
    return [
        //拼接
        //name键名content值
        ...props.map((prop) => `${prop.name}: ${createText(prop.value)}`),
        ...directives.map((dir) => {
            const content = dir.arg ? .content;
            switch (dir.name) {
                case 'bind':
                    return `${content}: ${createText(dir.exp)}`;
                case 'on':
                    //事件名：例如onClick
                    const eventName = `on${capitalize(content)}`;
                    let exp = dir.exp.content;

                    // 简化判断：以括号结尾，并且不含'=>'的情况，如 @click="foo()"
                    if (/\([^)]*?\)$/.test(exp) && !exp.includes('=>')) {
                        exp = `$event => (${exp})`;
                    }
                    return `${eventName}: ${exp}`;
                case 'html': //键是innerhtml值是表达式
                    return `innerHTML: ${createText(dir.exp)}`;
                default:
                    return `${dir.name}: ${createText(dir.exp)}`;
            }
        }),
    ];
}

// 可以不remove吗？不可以
function pluck(directives, name, remove = true) {
    const index = directives.findIndex((dir) => dir.name === name);
    const dir = directives[index];
    if (remove && index > -1) {
        directives.splice(index, 1);
    }
    return dir;
}
//纯文本节点直接返回content
// node只接收text和simpleExpresstion
function createTextVNode(node) {
    const child = createText(node);
    return `h(Text, null, ${child})`;
}
//内容判断
function createText({ content = '', isStatic = true } = {}) {
    return isStatic ? JSON.stringify(content) : content;
}