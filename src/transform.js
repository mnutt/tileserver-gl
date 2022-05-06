// transform.js
module.exports = function (fileInfo, api) {
    const j = api.jscodeshift;
	const source = j(fileInfo.source);

    // ------------------------------------------------------------------ SEARCH
    const nodes = j(source)
        .find(j.ExpressionStatement, {
            expression: {
                left: {
                    object: {
                        name: "module"
                    },
                    property: {
                        name: "exports"
                    }
                },
                operator: "="
            }
        })
        .filter(isTopNode);

    if (nodes.length > 1) {
        logger.error(
            "There should not be more than one `module.exports` declaration in a file. Aborting transformation"
        );
        return source.toSource();
    }


    // ----------------------------------------------------------------- REPLACE
    return nodes
        .replaceWith((path) => {
            return j.exportDefaultDeclaration(path.node.expression.right);
        })
        .toSource();
};