'use strict';

var EventEmitter = require('eventman');
var inherits = require('inherits');
var ProjectTab = require('./ProjectTab');
var Project = require('./Project');

function ProjectMap(opt) {

    EventEmitter.call(this);

    this._projects = [];

    this.projectTab = new ProjectTab();
    am.workspace.fillTab('project tab', this.projectTab.domElem);
}

inherits(ProjectMap, EventEmitter);
var p = ProjectMap.prototype;
module.exports = ProjectMap;

p.load = function (project) {
    
    if (!(project instanceof Project)) {

        project = new Project(project);
    }

    if (!_.include(this._projects, project)) {

        this._projects.push(project);

        project.on('focus.timeline', this._onFocusTimeline, this);
    }

    return project;
};

p.unload = function (project) {

    _.pull(this._projects, project);
    project.dispose();

    project.off('focus.timeline', this._onFocusTimeline, this);
};

p.focus = function (project) {

    project = this.load(project);

    if (this._currProject) {

        this._currProject.blur();
    }

    this._currProject = project;
    this._currProject.focus();

    this.emit('open', this._currProject);
};

p.blur = function () {

};

p.clear = function () {

    this._projects.slice().forEach(p => this.closeProject(p));
};

p.getCurrProject = function () {

    return this._currProject;
};

p._onFocusTimeline = function (timeline) {

    this.emit('change.timeline', timeline);
};