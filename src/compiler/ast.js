export const NodeTypes = {
    ROOT: 'ROOT',
    ELEMENT: 'ELEMENT',
    TEXT: 'TEXT',
    SIMPLE_EXPRESSION: 'SIMPLE_EXPRESSION',
    INTERPOLATION: 'INTERPOLATION',
    ATTRIBUTE: 'ATTRIBUTE',
    DIRECTIVE: 'DIRECTIVE',
};

export const ElementTypes = {
    ELEMENT: 'ELEMENT',
    COMPONENT: 'COMPONENT',
};
//return一个根节点，接收一个children属性
export function createRoot(children) {
    return {
        type: NodeTypes.ROOT,
        children,
    };
}