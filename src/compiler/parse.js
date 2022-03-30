import { camelize } from '../utils';
import { NodeTypes, createRoot, ElementTypes } from './ast';
import { isVoidTag, isNativeTag } from './index';

export function parse(content) {
    const context = createParserContext(content);
    return createRoot(parseChildren(context));
}

function createParserContext(content) {
    return {
        options: {
            //插值
            delimiters: ['{{', '}}'],
            isVoidTag,
            isNativeTag,
        },
        //在source.content中就可以取到模板字符串
        source: content,
    };
}

//拆分节点，元素节点div，属性节点id，指令节点v-if，
//文本节点hello，插值节点{ { name } }
function parseChildren(context) {
    const nodes = [];

    while (!isEnd(context)) {
        const s = context.source;
        let node;
        if (s.startsWith(context.options.delimiters[0])) {
            // '{{'
            node = parseInterpolation(context);
        } else if (s[0] === '<') {
            node = parseElement(context);
        } else {
            node = parseText(context);
        }
        nodes.push(node);
    }

    let removedWhitespace = false;
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.type === NodeTypes.TEXT) {
            // 全是空白的节点
            if (!/[^\t\r\n\f ]/.test(node.content)) {
                const prev = nodes[i - 1];
                const next = nodes[i + 1];
                if (!prev ||
                    !next ||
                    (prev.type === NodeTypes.ELEMENT &&
                        next.type === NodeTypes.ELEMENT &&
                        /[\r\n]/.test(node.content))
                ) {
                    removedWhitespace = true;
                    nodes[i] = null;
                } else {
                    // Otherwise, the whitespace is condensed into a single space
                    node.content = ' ';
                }
            } else {
                node.content = node.content.replace(/[\t\r\n\f ]+/g, ' ');
            }
        }
    }

    return removedWhitespace ? nodes.filter(Boolean) : nodes;
}

//插值节点{{}}
function parseInterpolation(context) {
    const [open, close] = context.options.delimiters;

    advanceBy(context, open.length);
    const closeIndex = context.source.indexOf(close);

    const content = parseTextData(context, closeIndex).trim();
    advanceBy(context, close.length);

    return {
        type: NodeTypes.INTERPOLATION,
        content: {
            type: NodeTypes.SIMPLE_EXPRESSION,
            isStatic: false,
            content,
        },
    };
}
//文本节点text，不支持文本节点中带有'<'符号
function parseText(context) {
    const endTokens = ['<', context.options.delimiters[0]];

    // 寻找text最近的endIndex。因为遇到'<'或'{{'都可能结束
    let endIndex = context.source.length;
    for (let i = 0; i < endTokens.length; i++) {
        const index = context.source.indexOf(endTokens[i], 1);
        if (index !== -1 && endIndex > index) {
            endIndex = index;
        }
    }

    const content = parseTextData(context, endIndex);

    return {
        type: NodeTypes.TEXT,
        content,
    };
}
//元素节点<div></div>
function parseElement(context) {
    // parse tag Start tag.
    const element = parseTag(context);
    //如果是自闭和</>直接不找children
    if (element.isSelfClosing || context.options.isVoidTag(element.tag)) {
        return element;
    }

    // Children.
    element.children = parseChildren(context);

    // parse tag End tag.
    parseTag(context);

    return element;
}

//工具函数，去掉前面的字符
function advanceBy(context, numberOfCharacters) {
    const { source } = context;
    context.source = source.slice(numberOfCharacters);
}
//工具函数,去掉空格，利用正则
function advanceSpaces(context) {
    const match = /^[\t\r\n\f ]+/.exec(context.source);
    if (match) {
        advanceBy(context, match[0].length);
    }
}

//提取里面的内容
// 没有trim
function parseTextData(context, length) {
    const rawText = context.source.slice(0, length);
    advanceBy(context, length);
    return rawText;
}
//元素element节点的tag
function parseTag(context) {
    // Tag open.
    const match = /^<\/?([a-z][^\t\r\n\f />]*)/i.exec(context.source);
    const tag = match[1]; //获取中间的标签名

    advanceBy(context, match[0].length);
    advanceSpaces(context);

    // Attributes.解析属性和指令
    const { props, directives } = parseAttributes(context);

    // Tag close.是否自闭和
    const isSelfClosing = context.source.startsWith('/>');

    advanceBy(context, isSelfClosing ? 2 : 1);

    const tagType = isComponent(tag, context) ?
        ElementTypes.COMPONENT :
        ElementTypes.ELEMENT;

    return {
        type: NodeTypes.ELEMENT,
        tag, //标签名
        tagType, //是component还是element
        props, //属性节点数组
        directives, //指令数组
        isSelfClosing, //是否是自闭和
        children: [],
    };
}

function isEnd(context) {
    const s = context.source;
    return s.startsWith('</') || !s;
} //判断是component组件吗
function isComponent(tag, context) {
    const { options } = context;
    return !options.isNativeTag(tag);
}

//解析element节点的属性和指令
function parseAttributes(context) {
    const props = []; //属性
    const directives = []; //指令
    while (
        context.source.length &&
        !context.source.startsWith('>') &&
        !context.source.startsWith('/>')
    ) {
        const attr = parseAttribute(context);
        if (attr.type === NodeTypes.ATTRIBUTE) {
            props.push(attr);
        } else {
            directives.push(attr);
        }
    }
    return { props, directives };
}
//解析例如：id='foo',拿到name->id,value->foo
function parseAttribute(context) {
    // 属性节点Name.
    // name判断很宽除了下述几个字符外都支持
    const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source);
    const name = match[0];

    advanceBy(context, name.length);
    advanceSpaces(context);

    // 属性节点Value
    let value;
    if (context.source[0] === '=') {
        advanceBy(context, 1);
        advanceSpaces(context);
        value = parseAttributeValue(context);
        advanceSpaces(context);
    }

    // Directive指令节点 v-bind @click :
    if (/^(v-|:|@)/.test(name)) {
        let dirName, argContent;//指令名称，bind-click
        if (name[0] === ':') {
            dirName = 'bind';
            argContent = name.slice(1);
        } else if (name[0] === '@') {
            dirName = 'on';
            argContent = name.slice(1);
        } else if (name.startsWith('v-')) {
            [dirName, argContent] = name.slice(2).split(':');
        }

        return {
            type: NodeTypes.DIRECTIVE,
            name: dirName,
            exp: value && {
                type: NodeTypes.SIMPLE_EXPRESSION,
                content: value.content,
                isStatic: false,
            },
            arg: argContent && {
                type: NodeTypes.SIMPLE_EXPRESSION,
                content: camelize(argContent),
                isStatic: true,
            }
        };
    }

    // 返回属性节点Attribute
    return {
        type: NodeTypes.ATTRIBUTE,
        name,
        value: value && {
            type: NodeTypes.TEXT,
            content: value.content,
        },
    };
}
//取值
function parseAttributeValue(context) {
    // 不考虑没有引号的情况
    const quote = context.source[0];
    advanceBy(context, 1);

    const endIndex = context.source.indexOf(quote);
    const content = parseTextData(context, endIndex);

    advanceBy(context, 1);

    return { content };
}