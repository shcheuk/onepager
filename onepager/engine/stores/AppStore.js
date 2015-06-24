"use strict";

const $                   = jQuery; //jshint ignore: line
const _                   = require('underscore');
const assign              = require('object-assign');
const AppDispatcher       = require('../dispatchers/AppDispatcher');
const Constants           = require('../constants/AppConstants');
const SectionTransformer  = require('../lib/SectionTransformer');
const ShouldSync          = require('../lib/ShouldSync');
const Activity            = require('../lib/Activity');
const ODataStore          = require('./ODataStore');
const BaseStore           = require('./BaseStore')    ;
const SyncService         = require('./SyncService');

require('../lib/_mixins');




// data storage
let _blocks             = ODataStore.blocks;
let _sections           = SectionTransformer.misitifySections(ODataStore.sections, ODataStore.blocks);
let _blockState         = {open: false};
let _menuState          = {id: null, index: null, title: null};
let _sidebarTabState    = {active: 'op-sections'};
let _activeSectionIndex = null;
let _savedSections      = _.copy(_sections);
let AUTO_SAVE_DELAY     = 500;

// di
let shouldLiveSectionsSync  = ShouldSync(_sections, 'sections'); //jshint ignore:line
let shouldSectionsSync      = ShouldSync(_sections, 'sections'); //jshint ignore:line
let inactive                = Activity(AUTO_SAVE_DELAY); //jshint ignore:line
let syncService             = SyncService(ODataStore.pageId, inactive, shouldSectionsSync); //jshint ignore:line
let liveService             = SyncService(null, inactive, shouldLiveSectionsSync); //jshint ignore:line


// function to activate a section
function setActiveSection(index){
  _activeSectionIndex = index;
}

// function to add a section
function addSection(section) {
  let sectionIndex = _sections.length; //isnt it :p
  
  //its a row section to need to uni(quei)fy
  section = SectionTransformer.unifySection(section);
  _sections.push(section);
  
  liveService.updateSection(_sections, sectionIndex);

  setActiveSection(sectionIndex);
}


// function to update a section
function updateSection(sectionIndex, section){
  //immutable please?
  _sections[sectionIndex] = section; 

  liveService.updateSection(_sections, sectionIndex);
}

// function to duplicate a section
function duplicateSection(index){
  let sectionIndex = _sections.length; //isnt it :p
  
  //its a row section to need to uni(quei)fy
  let section = SectionTransformer.unifySection(_sections[index], true);
  
  
  _sections = _.pushAt(_.copy(_sections), index+1, section);

  
  liveService.updateSection(_sections, sectionIndex);

  setActiveSection(sectionIndex);
}


// function to remove section
function removeSection(index){
  //immutable please
  _sections.splice(index, 1);

  //bad pattern
  liveService.rawUpdate(_sections);

  setActiveSection(null);
}

function sectionSynced(index, res){
  let section;
  
  _sections[index]  = _.copy(_sections[index]);
  section           = _sections[index];

  section.content   = SectionTransformer.getLiveModeHTML(section.livemode, res.content);
  SectionTransformer.appendStyleToDOM(section.id, res.style);
}

// Facebook style store creation.
let AppStore = assign({}, BaseStore, {

  // public methods used by Controller-View to operate on data
  getAll() {
    return {
      blocks            : _blocks,
      isDirty           : this.isDirty(),
      sections          : _sections,
      menuState         : _menuState,
      sidebarTabState   : _sidebarTabState,
      blockState        : _blockState,
      activeSection     : _sections[_activeSectionIndex],
      activeSectionIndex: _activeSectionIndex,
    };
  },

  save(){
    let updated = syncService.rawUpdate(_sections);
    
    updated.then(()=>{
      _savedSections = _.copy(_sections);
      AppStore.emitChange();
    });

    return updated;
  },

  isDirty(){
    return JSON.stringify(_sections) !== JSON.stringify(_savedSections);
  },

  get(index){
    return _sections[index];
  },

  getBlock(slug){
    return _.find(_blocks, {slug});
  },

  setTabState(state){
    _sidebarTabState = state;
    this.emitChange();
  },

  setSections(sections){
    _sections = sections;
    this.emitChange();
  },

  setMenuState(id, title, index){
    _menuState = {id, title, index};
    this.emitChange();
  },

  reorder(sections, index){
    setActiveSection(index);
    this.setSections(sections);
    liveService.rawUpdate(_sections);
  },

  rawUpdate(){
    liveService.rawUpdate(_sections);
  },

  // register store with dispatcher, allowing actions to flow through
  dispatcherIndex: AppDispatcher.register(function(payload) {
    let action = payload.action;

    switch(action.type) {
      case Constants.ActionTypes.ADD_SECTION:
        // NOTE: if this action needs to wait on another store:
        // AppDispatcher.waitFor([OtherStore.dispatchToken]);
        // For details, see: http://facebook.github.io/react/blog/2014/07/30/flux-actions-and-the-dispatcher.html#why-we-need-a-dispatcher
        addSection(action.section);
        AppStore.emitChange();
        break;

      case Constants.ActionTypes.EDIT_SECTION:
        setActiveSection(action.index);
        AppStore.setTabState({active: 'op-contents'});
        AppStore.emitChange();
        break;

      case Constants.ActionTypes.UPDATE_SECTION:
        updateSection(action.index, action.section);
        AppStore.emitChange();
        break;

      case Constants.ActionTypes.REMOVE_SECTION:
        removeSection(action.index);
        AppStore.emitChange();
        break;

      case Constants.ActionTypes.DUPLICATE_SECTION:
        duplicateSection(action.index);
        AppStore.emitChange();
        break;

      case Constants.ActionTypes.SECTIONS_SYNCED:
        sectionSynced(action.index, action.res);
        AppStore.emitChange();
        break;

      // add more cases for other actionTypes...
    }
  })

});

module.exports = AppStore;