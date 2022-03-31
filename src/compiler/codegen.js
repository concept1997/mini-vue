import { NodeTypes } from '.';
import { capitalize } from '../utils';
import { ElementTypes } from './ast';
//生成函数
export function generate(ast) {
    const returns = traverseNode(ast);
    const code = `
with(ctx){
  const { h, Text, Fragment, renderList, withModel, resolveComponent } = MiniVue;
  return ${returns}
}
`;
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
            return result;
        case NodeTypes.ELEMENT:
            return resolveElementASTNode(node, parent);
        case NodeTypes.INTERPOLATION:
            return createTextVNode(node.content);
        case NodeTypes.TEXT:
            return createTextVNode(node);
    }
}

//纯文本节点直接返回content
function createTextVNode(node) {
    const child = createText(node);
    return `h(Text, null, ${child})`;
}

//文本内容判断是不是静态
function createText({ isStatic = true, content = '' } = {}) {
    return isStatic ? JSON.stringify(content) : content;
}

// 专门处理特殊指令
function resolveElementASTNode(node, parent) {
    const ifNode =
        pluck(node.directives, 'if') || pluck(node.directives, 'else-if');
    if (ifNode) {
        let consequent = resolveElementASTNode(node, parent);
        let alternate;

        // 如果有ifNode，则需要看它的下一个元素节点是否有else-if或else
        const { children } = parent;
        let i = children.findIndex((child) => child === node) + 1;

        for (; i < children.length; i++) {
            const sibling = children[i];
            if (sibling.type === NodeTypes.TEXT && !sibling.content.trim()) {
                children.splice(i, 1);
                i--;
                continue;
            }

            // <div v-if="ok"/> <p v-else-if="no"/> <span v-else/>
            // 为了处理上面的例子，需要将空节点删除
            // 也因此，才需要用上for循环
            if (sibling.type === NodeTypes.ELEMENT) {
                if (
                    pluck(sibling.directives, 'else') ||
                    pluck(sibling.directives, 'else-if', false)
                    // else-if 既是上一个条件语句的 alternate，又是新语句的 condition
                    // 因此pluck时不删除指令，下一次循环时当作ifNode处理
                ) {
                    alternate = resolveElementASTNode(sibling, parent);
                    children.splice(i, 1);
                }
            }
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
      node,
      parent
    )}))`;
    }
    return createElementVNode(node);
}

function createElementVNode(node) {
    const { children, tagType } = node;
    const tag =
        tagType === ElementTypes.ELEMENT ?
        `"${node.tag}"` :
        `resolveComponent("${node.tag}")`;

    const propArr = createPropArr(node);

    let propStr = propArr.length ? `{ ${propArr.join(', ')} }` : 'null';

    const vModel = pluck(node.directives, 'model');
    if (vModel) {
        const getter = `() => ${createText(vModel.exp)}`;
        const setter = `value => ${createText(vModel.exp)} = value`;
        propStr = `withModel(${tag}, ${propStr}, ${getter}, ${setter})`;
    }

    if (!children.length) {
        if (propStr === 'null') {
            return `h(${tag})`;
        }
        return `h(${tag}, ${propStr})`;
    }

    let childrenStr = traverseChildren(node);
    return `h(${tag}, ${propStr}, ${childrenStr})`;
}

function createPropArr(node) {
    //属性和指令
    const { props, directives } = node;
    return [
        //拼接
        //name键名content值
        ...props.map((prop) => `${prop.name}: ${createText(prop.value)}`),
        ...directives.map((dir) => {
            switch (dir.name) {
                case 'bind':
                    return `${dir.arg.content}: ${createText(dir.exp)}`;
                case 'on':
                    //事件名：例如onClick
                    const eventName = `on${capitalize(dir.arg.content)}`;

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
    return `[${results.join(', ')}]`;
}

function pluck(directives, name, remove = true) {
    const index = directives.findIndex((dir) => dir.name === name);
    const dir = directives[index];
    if (index > -1 && remove) {
        directives.splice(index, 1);
    }
    return dir;
}