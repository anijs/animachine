"use strict";

var EventEmitter = require('eventman');
var inherits = require('inherits');
var Timeline = require('../timeline');
var defineCompactProperty = require('../utils/defineCompactProperty');
var mstScript = require('./script.project.mst');

function Project(save = {}) {

    EventEmitter.call(this);

    this._timelines = [];
    this.inputs = {};

    this.useSave(save);
}

inherits(Project, EventEmitter);
var p = Project.prototype;
module.exports = Project;

defineCompactProperty(p, {name: 'name', type: 'string', startValue: 'new project'});

p.wake = function () {

    if (!this.currTimeline && !_.isEmpty(this._timelines)) {

        this.selectTimeline(this._timelines[0]);
    }

    if (this.currTimeline) {

        this.currTimeline.wake();
    }
};

p.sleep = function () {

    if (this.currTimeline) {

        this.currTimeline.sleep();
    }
};

p.useSave = function (save = {}) {

    var block = am.history.blockSaving();

    if (_.has(save, 'name')) {
        this.name = save.name;
    }

    if (_.isArray(save.timelines)) {

        save.timelines.forEach(tl => this.addTimeline(tl));
    }

    if (_.has(save, 'currTimelineIdx')) {
        this.selectTimeline(save.currTimelineIdx);
    }

    am.history.releaseBlock(block);
};

p.getSave = function () {

    var save = {
        name: this.name,
        timelines: this._timelines.map(tl => tl.getSave()),
    };

    if (this.currTimeline) {
        save.currTimelineIdx = this._timelines.indexOf(this.currTimeline);
    }

    return save;
};

p.getScript = function (opt={}) {

    var timelines = [];

    this._timelines.forEach(timeline => {
        timelines.push(timeline.name + ':' + timeline.getScript());
    });

    var script = Mustache.render(mstScript, {
        projectName: this.name,
        timelines: '{' + timelines.join('\n') + '}',
        saveJson: opt.includeSave && JSON.stringify(this.getSave()),
    });

    if (opt.minify) {

        script = minify(script);
    }

    return script;

    function minify(code) {

        return code;//TODO

        // var result = UglifyJS.minify(code, {
        //     fromString: true,
        //     mangle: false,
        //     output: {
        //         comments: /@amsave/,
        //     },
        //     compress: {
        //         // reserved: 'JSON_SAVE',
        //     }
        // });
        //
        // return result.code;
        //
        // var toplevel = null;
        // toplevel = UglifyJS.parse(code, {
        //     filename: 'save',
        //     toplevel: toplevel
        // });
        //
        // toplevel.figure_out_scope();
        //
        // var compressor = UglifyJS.Compressor({mangle: false});
        // var compressed_ast = toplevel.transform(compressor);
        //
        // compressed_ast.figure_out_scope();
        // compressed_ast.compute_char_frequency();
        // compressed_ast.mangle_names();
        //
        // return compressed_ast.print_to_string({comments: 'all'});
    }
};

p.addTimeline = function (timeline) {

    //create the instance if the parameter is a save object
    if (!(timeline instanceof Timeline)) {

        timeline = new Timeline(timeline, this);
    }
    //remove the timeline if it's already added to an other project
    else if (timeline.project && timeline.project !== this) {

        timeline.project.removeTimeline(timeline);
        timeline.project = this;
    }



    timeline.name = makeUnique(timeline.name, _.pluck(this._timelines, 'name'));

    //avoid to add twice
    if (_.include(this._timelines, timeline)) {
        return;
    }

    am.history.save({
        undo: () => this.removeTimeline(timeline),
        redo: () => this.addTimeline(timeline),
        name: 'add timeline',
    });

    this._timelines.push(timeline);

    this.emit('addTimeline');
};

p.removeTimeline = function (timeline) {

    if (!_.include(this._timelines, timeline)) {
        return;
    }

    timeline.project = undefined;

    am.history.save({
        undo: () => this.addTimeline(timeline),
        redo: () => this.removeTimeline(timeline),
        name: 'remove timeline',
    });

    _.pull(this._timelines, timeline);

    //TODO wrap to the removing save
    if (this.currTimeline === timeline) {

        this.selectTimeline(this._timelines[0]);
    }

    this.emit('removeTimeline');
};

p.selectTimeline = function (timeline) {

    if (_.isNumber(timeline)) {

        timeline = this._timelines[timeline];
    }

    if (timeline === this.currTimeline) return;

    if (this.currTimeline) {

        let oldTimeline = this.currTimeline;

        am.history.save({
            undo: () => this.selectTimeline(oldTimeline),
            redo: () => this.selectTimeline(timeline),
            name: 'select ' + timeline.name,
        });

        oldTimeline.sleep();
    }

    this.currTimeline = timeline;

    this.currTimeline.wake();

    this.emit('change.currTimeline', this.currTimeline);
};




p.addInput = function (path, value) {

    var obj = this.inputs;

    if (typeof(path) !== 'string') {
        //TODO: throw a detailed error
        throw Error();
    }

    path = path.split('.');

    path.forEach(function (name, idx, arr) {

        if (idx === arr.length-1) {

            obj[name] = value;
        }
        else {
            obj = _.isPlainObject(obj[name]) ? obj[name] : {};
        }
    });

    this.emit('change.inputs');
};

p.setInputs = function (inputs) {

    if (!_.isPlainObject(inputs)) {
        //TODO: throw a detailed error
        throw Error();
    }

    this.inputs = inputs;

    this.emit('change.inputs');
};

p.getInputPaths = function (maxLevel = 4) {

    var ret = [];

    var step = (obj, path, level) => {

        Object.keys(obj).forEach(key => {

            ret.push(path + key);

            if (_.isPlainObject(obj[key]) && level <= maxLevel) {

                step(obj[key], path + key + '.', level + 1);
            }
        });
    };

    step(this.inputs, '', 0);

    return ret;
};

//TODO outsource this
/**opt {
    separator: '-',
    mode: 'suffix',
    fillHoles: 'false',
    fixedDigitCount: false
}*/
function makeUnique (name, list) {

    if (list.indexOf(name) === -1) return name;

    var highest = 0,
        base = name.replace(/-\d+$/, ""),
        rx = new RegExp(base + '-(\\d+)$');

    list.forEach(n => {

        var match = rx.exec(n);
        if (match && match[1] > highest) {

            highest = match[1];
        }
    });

    return base + '-' + (parseInt(highest) + 1);
}


p.dispose = function () {

    _.invoke(this._timelines, 'dispose');
};
