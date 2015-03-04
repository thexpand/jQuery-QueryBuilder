/**
 * Access Node object stored in jQuery objects
 * @param el {jQuery|Node}
 * @return {Node}
 */
function Model(el) {
    if (!(this instanceof Model)) {
        return Model.getModel(el);
    }

    this.root = null;
};

MicroEvent.mixin(Model);

Model.DATAKEY = 'queryBuilderModel';

Model.getModel = function(el) {
    if (!el) {
        return null;
    }
    else if (el instanceof Node) {
        return el;
    }
    else {
        return $(el).data(Model.DATAKEY);
    }
};

Model.defineProperties = function(obj, fields) {
    fields.forEach(function(field) {
        Object.defineProperty(obj.prototype, field, {
            enumerable: true,
            get: function() {
                return this.__[field];
            },
            set: function(value) {
                var oldValue = (this.__[field] !== null && typeof this.__[field] === 'object') ?
                  $.extend({}, this.__[field]) :
                  this.__[field];

                this.__[field] = value;

                if (this.model !== null) {
                    this.model.trigger('update', this, field, value, oldValue);
                }
            }
        });
    });
};

// Node abstract CLASS
// ===============================
/**
 * @param {Node}
 * @param {jQuery}
 */
var Node = function(parent, $el) {
    if (!(this instanceof Node)) {
        return new Node();
    }

    Object.defineProperty(this, '__', { value: {}});

    $el.data(Model.DATAKEY, this);

    this.model = parent === null ? null : parent.model;
    this.parent = parent;
    // this.level // initialized in 'parent' setter
    this.$el = $el;
    this.id = $el[0].id
    this.error = null;
};

Model.defineProperties(Node, ['level', 'error']);

Object.defineProperty(Node.prototype, 'parent', {
    enumerable: true,
    get: function() {
        return this.__.parent;
    },
    set: function(value) {
        this.__.parent = value;
        this.level = this.parent === null ? 1 : this.parent.level+1;
    }
});

/**
 * Check if this Node is the root
 * @return {boolean}
 */
Node.prototype.isRoot = function() {
    return (this.level === 1);
};

/**
 * Return node position inside parent
 * @return {int}
 */
Node.prototype.getPos = function() {
    if (this.isRoot()) {
        return -1;
    }
    else {
        return this.parent.getNodePos(this);
    }
};

/**
 * Delete self
 */
Node.prototype.drop = function() {
    this.model.trigger('drop', this);

    if (!this.isRoot()) {
        this.parent._dropNode(this);
        this.parent = null;
    }
};

/**
 * Move itself after another Node
 * @param {Node}
 * @return {Node} self
 */
Node.prototype.moveAfter = function(node) {
    if (this.isRoot()) return;

    this.parent._dropNode(this);
    node.parent._addNode(this, node.getPos()+1);
    return this;
};

/**
 * Move itself at the beginning of parent or another Group
 * @param {Group,optional}
 * @return {Node} self
 */
Node.prototype.moveAtBegin = function(target) {
    if (this.isRoot()) return;

    if (target === undefined) {
        target = this.parent;
    }

    this.parent._dropNode(this);
    target._addNode(this, 0);
    return this;
};

/**
 * Move itself at the end of parent or another Group
 * @param {Group,optional}
 * @return {Node} self
 */
Node.prototype.moveAtEnd = function(target) {
    if (this.isRoot()) return;

    if (target === undefined) {
        target = this.parent;
    }

    this.parent._dropNode(this);
    target._addNode(this, target.length());
    return this;
};


// GROUP CLASS
// ===============================
/**
 * @param {Group}
 * @param {jQuery}
 */
var Group = function(parent, $el) {
    if (!(this instanceof Group)) {
        return new Group(parent, $el);
    }

    Node.call(this, parent, $el);

    this.condition = null;
    this.rules = [];
};

Group.prototype = Object.create(Node.prototype);
Group.prototype.constructor = Group;

Model.defineProperties(Node, ['condition']);

/**
 * Empty the Group
 */
Group.prototype.empty = function() {
    this.each('reverse', function(rule) {
        rule.drop();
    }, function(group) {
        group.drop();
    });
};

/**
 * Delete self
 */
Group.prototype.drop = function() {
    this.empty();
    Node.prototype.drop.call(this);
};

/**
 * Return the number of children
 * @return {int}
 */
Group.prototype.length = function() {
    return this.rules.length;
};

/**
 * Add a Node at specified index
 * @param {Node}
 * @param {int,optional}
 * @return {Node} the inserted node
 */
Group.prototype._addNode = function(node, index) {
    if (index === undefined) {
        index = this.length();
    }

    this.rules.splice(index, 0, node);
    node.parent = this;

    this.model.trigger('add', node, index);

    return node;
};

/**
 * Add a Group by jQuery element at specified index
 * @param {jQuery}
 * @param {int,optional}
 * @return {Group} the inserted group
 */
Group.prototype.addGroup = function($el, index) {
    return this._addNode(new Group(this, $el), index);
};

/**
 * Add a Rule by jQuery element at specified index
 * @param {jQuery}
 * @param {int,optional}
 * @return {Rule} the inserted rule
 */
Group.prototype.addRule = function($el, index) {
    return this._addNode(new Rule(this, $el), index);
};

/**
 * Delete a specific Node
 * @param {Node}
 * @return {Group} self
 */
Group.prototype._dropNode = function(node) {
    var index = this.getNodePos(node);
    if (index !== -1) {
        node.parent = null;
        this.rules.splice(index, 1);
    }
    return this;
};

/**
 * Return position of a child Node
 * @param {Node}
 * @return {int}
 */
Group.prototype.getNodePos = function(node) {
    return this.rules.indexOf(node);
};

/**
 * Iterate over all Nodes
 * @param {boolean,optional} iterate in reverse order, required if you delete nodes
 * @param {function} callback for Rules
 * @param {function,optional} callback for Groups
 * @return {boolean}
 */
Group.prototype.each = function(reverse, cbRule, cbGroup) {
    if (typeof reverse === 'function') {
        cbGroup = cbRule;
        cbRule = reverse;
        reverse = false;
    }

    var i = reverse ? this.rules.length-1 : 0,
        l = reverse ? 0 : this.rules.length-1,
        c = reverse ? -1 : 1,
        test = function(){ return reverse ? i>=l : i<=l; };

    for (; test(); i+=c) {
        if (this.rules[i] instanceof Group) {
            if (cbGroup !== undefined) {
                stop = cbGroup.call(null, this.rules[i]) === false;
            }
        }
        else {
            stop = cbRule.call(null, this.rules[i]) === false;
        }

        if (stop) {
            break;
        }
    }

    return !stop;
};

/**
 * Return true if the group contains a particular Node
 * @param {Node}
 * @param {boolean,optional} recursive search
 * @return {boolean}
 */
Group.prototype.contains = function(node, deep) {
    if (this.getNodePos(node) !== -1) {
        return true;
    }
    else if (!deep) {
        return false;
    }
    else {
        // the loop will return with false as soon as the Node is found
        return !this.each(function(rule) {
            return true;
        }, function(group) {
            return !group.contains(node, true);
        });
    }
};


// RULE CLASS
// ===============================
/**
 * @param {Group}
 * @param {jQuery}
 */
var Rule = function(parent, $el) {
    if (!(this instanceof Rule)) {
        return new Rule(parent, $el);
    }

    Node.call(this, parent, $el);

    this.filter = null;
    this.operator = null;
    this.flags = {};
};

Rule.prototype = Object.create(Node.prototype);
Rule.prototype.constructor = Rule;

Model.defineProperties(Node, ['filter', 'operator', 'flags']);
