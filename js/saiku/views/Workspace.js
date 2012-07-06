/*
 * Workspace.js
 * 
 * Copyright (c) 2011, OSBI Ltd. All rights reserved.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston,
 * MA 02110-1301  USA
 */
/**
 * The analysis workspace
 */
var Workspace = Backbone.View.extend({
    className: 'tab_container',
    
    events: {
        'click .sidebar_separator': 'toggle_sidebar',
        'change .cubes': 'new_query',
        'drop': 'remove_dimension',
        'click .refresh_cubes' : 'refresh',
        'change .connections' : 'select_connection'
    },
    
    initialize: function(args) {
        // Maintain `this` in jQuery event handlers
        _.bindAll(this, "adjust", "toggle_sidebar", "prepare", "new_query", 
                "init_query", "update_caption", "populate_selections","refresh", "render_cubenav");
                
        // Attach an event bus to the workspace
        _.extend(this, Backbone.Events);
        this.loaded = false;
        this.bind('dimensions:loaded',this.populate_selections);

        // Generate toolbar and append to workspace
        this.toolbar = new WorkspaceToolbar({ workspace: this });
        this.toolbar.render();
        
        // Create drop zones
        this.drop_zones = new WorkspaceDropZone({ workspace: this });
        this.drop_zones.render();
        
        // Generate table
        this.table = new Table({ workspace: this });
        
        // Pull query from args
        if (args && args.query) {
            this.query = args.query;
            this.query.workspace = this;
            this.query.save({}, { success: this.init_query });            
        }
        // Flash cube navigation when rendered
        Saiku.session.bind('tab:add', this.prepare);
        Saiku.events.bind('connections:loaded', this.render_cubenav);

    },
    
    caption: function() {
        if (this.query && this.query.name) {
            return this.query.name;
        }
        
        return "Unsaved query (" + (Saiku.tabs.queryCount + 1) + ")";
    },
    
    template: function() {
        var template = $("#template-workspace").html() || "";
        return _.template(template)({
            cube_navigation: Saiku.session.sessionworkspace.cube_navigation,
            connections_navigation: Saiku.session.sessionworkspace.connections_navigation
        });        
    },

    select_connection: function() {
        this.connection = $(this.el).find('.connections').val();
        if (this.connection.length > 0) {
            Saiku.session.sessionworkspace.connection = this.connection;
            var c = Saiku.session.sessionworkspace.cubes[this.connection];
            if (typeof c != "undefined" && c != null) {
                this.render_cubenav(c);
            } else {
                Saiku.session.sessionworkspace.fetch({success:Saiku.session.sessionworkspace.process_datasources},{});    
            }
        } else {
            $(this.el).find(".cubenav").html("");
            this.selected_cube = null;
            this.clear();

        }
    },

    refresh: function() {
        this.connection = $(this.el).find('.connections').val();
        Saiku.session.sessionworkspace.connection = this.connection;
        Saiku.session.sessionworkspace.fetch({success:Saiku.session.sessionworkspace.process_datasources},{});
        $(this.el).find(".cubenav").html("");
        this.clear();
    },

    render_cubenav: function(connections) {
        var self = this;
        _.each(connections, function(connection) {
            if( connection.name == self.connection) {
                var cube_navigation = _.template($("#template-cubes").html())({
                    connections: connections
                });
                $(self.el).find(".cubenav").html(cube_navigation);
                this.selected_cube = null;
                self.clear();
            }
        });
    },
    
    render: function() {
        // Load template
        $(this.el).html(this.template());
        
        // Show toolbar
        $(this.el).find('.workspace_toolbar').append($(this.toolbar.el));
        
        // Show drop zones
        $(this.el).find('.workspace_editor').append($(this.drop_zones.el));

        
        // Activate sidebar for removing elements
        $(this.el).find('.sidebar')
            .droppable({
                accept: '.d_measure, .d_dimension'
            });
        
        // Add results table
        $(this.el).find('.workspace_results')
            .append($(this.table.el));
        
        // Adjust tab when selected
        this.tab.bind('tab:select', this.adjust);
        $(window).resize(this.adjust);
            
        // Fire off new workspace event
        Saiku.session.trigger('workspace:new', { workspace: this });

        return this; 
    },
    
    clear: function() {
        // Prepare the workspace for a new query
        $(this.el).find('.workspace_results table,.connectable')
            .html('');
        
        // Trigger clear event
        Saiku.session.trigger('workspace:clear', { workspace: this });

        if (this.selected_cube) {
            // Create new DimensionList and MeasureList
            this.dimension_list = new DimensionList({
                workspace: this,
                dimension: Saiku.session.sessionworkspace.dimensions[this.selected_cube]
            });        
            $(this.el).find('.dimension_tree').html('').append($(this.dimension_list.el));
            
            this.measure_list = new DimensionList({
                workspace: this,
                dimension: Saiku.session.sessionworkspace.measures[this.selected_cube]
            });
            $(this.el).find('.measure_tree').html('').append($(this.measure_list.el));
        } else {
            // Someone literally selected "Select a cube"
            $(this.el).find('.dimension_tree').html('');
            $(this.el).find('.measure_tree').html('');
            return;
        }


    },
    
    adjust: function() {
        // Adjust the height of the separator
        $separator = $(this.el).find('.sidebar_separator');
        var heightReduction = 87;
        if (Settings.PLUGIN == true || Settings.BIPLUGIN == true) {
            heightReduction = 2;
        }
        $separator.height($("body").height() - heightReduction);
        $(this.el).find('.sidebar').height($("body").height() - heightReduction);
        
        // Adjust the dimensions of the results window
        $(this.el).find('.workspace_results').css({
            height: $(document).height() - $("#header").height() -
                $(this.el).find('.workspace_toolbar').height() - 
                $(this.el).find('.workspace_fields').height() - 40
        });
        
        // Fire off the adjust event
        this.trigger('workspace:adjust', { workspace: this });
    },
    
    toggle_sidebar: function() {
        // Toggle sidebar
        $(this.el).find('.sidebar').toggleClass('hide');
        $(this.toolbar.el).find('.toggle_sidebar').toggleClass('on');
        var new_margin = $(this.el).find('.sidebar').hasClass('hide') ?
                5 : 265;
        $(this.el).find('.workspace_inner').css({ 'margin-left': new_margin });
    },
    
    prepare: function() {
        // Draw user's attention to cube navigation
        $(this.el).find('.cubes')
            .parent()
            .css({ backgroundColor: '#AC1614' })
            .delay(500)
            .animate({ backgroundColor: '#fff' }, 'slow');
    },
    
    new_query: function() {
        // Delete the existing query
        if (this.query) {
            this.query.destroy();
        }
        
        // Initialize the new query
        this.selected_cube = $(this.el).find('.cubes').val();

        if(this.selected_cube.length == 0) {
            this.clear();
            return false;
        }


        var parsed_cube = this.selected_cube.split('/');
        var cube = parsed_cube[3];
        for (var i = 4; i < parsed_cube.length; i++) {
            cube += "/" + parsed_cube[i];
        }
        this.query = new Query({
            connection: parsed_cube[0],
            catalog: parsed_cube[1],
            schema: (parsed_cube[2] == "null" ? "" : parsed_cube[2]) ,
            cube: decodeURIComponent(cube),
            formatter: Settings.CELLSET_FORMATTER
        }, {
            workspace: this
        });
        
        // Save the query to the server and init the UI
        Saiku.session.trigger('workspace:clear', { workspace: this });
        this.query.save();
        this.init_query();
    },
    
    init_query: function() {
        if ((Settings.MODE == "table") && this.query) {
            this.query.run();
            return;
        }

        if (this.query.get('type') == "MDX") {
            this.query.set({ formatter : "flat"});
            
            $(this.drop_zones.el).remove();
            this.toolbar.switch_to_mdx();
            if (! $(this.el).find('.sidebar').hasClass('hide')) {
                this.toggle_sidebar();
            }

            $(this.el).find('.workspace_results').css({
            height: $(document).height() - (typeof $("#header").height() !== "undefined" ? $("#header").height() : 0)  -
                (typeof $(this.el).find('.workspace_toolbar').height() !== "undefined" ? $(this.el).find('.workspace_toolbar').height() : 0)  -
                $(this.el).find('.mdx_input').height() - 80
            });

        } else {
            $(this.el).find('.workspace_fields').show();
            $(this.el).find('.workspace_editor .mdx_input').val('').addClass('hide');
            $(this.toolbar.el).find('.auto, ,.toggle_fields, .query_scenario, .buckets, .non_empty, .swap_axis, .mdx, .switch_to_mdx').parent().show();
            $(this.el).find('.run').attr('href','#run_query');
        }

        if ((Settings.MODE == "view") && this.query) {
            this.query.run();
            return;
        }

        // Find the selected cube
        if (this.selected_cube === undefined) {
            var schema = this.query.get('schema');
            $(this.el).find('.connections')
                .val(this.query.get('connection'));
            this.selected_cube = this.query.get('connection') + "/" + 
                this.query.get('catalog') + "/"
                + ((schema == "" || schema == null) ? "null" : schema) 
                + "/" + this.query.get('cube');
            $(this.el).find('.cubes')
                .val(this.selected_cube);
        }        
        // Clear workspace
        this.clear();
    },

    populate_selections: function(dimension_el) {

        if (this.other_dimension) {
        // Populate selections - trust me, this is prettier than it was :-/
        var axes = this.query ? this.query.get('axes') : false;
        if (axes) {
            for (var axis_iter = 0; axis_iter < axes.length; axis_iter++) {
                var axis = axes[axis_iter];
                var $axis = $(this.el).find('.' + 
                    axis.name.toLowerCase() + ' ul');
                for (var dim_iter = 0; dim_iter < axis.dimensionSelections.length; dim_iter++) {
                    var dimension = axis.dimensionSelections[dim_iter];
                    var levels = [];
                    var members = {};

                    if (dimension.name != "Measures" && dimension.selections.length > 0) {
                        var ds = Saiku.session.sessionworkspace.dimensions[this.selected_cube].get('data');
                        var h = dimension.selections[0].hierarchyUniqueName;
                        _.each(ds, function(d) {
                            if (dimension.name == d.name) {
                                _.each(d.hierarchies, function(hierarchy) {
                                    if (hierarchy.uniqueName == h) {
                                        var levels = [];
                                        _.each(hierarchy.levels, function(level) {
                                            levels.push(level.uniqueName);
                                        });
                                        dimension.selections = _.sortBy(dimension.selections, function(selection) {
                                            return _.indexOf(levels, selection.levelUniqueName);
                                        }); 
                                    }
                                });
                            }
                        });
                    } else if (dimension.name == "Measures" && dimension.selections.length > 0) {
                        var ms = Saiku.session.sessionworkspace.measures[this.selected_cube].get('data');
                        var mlist = [];
                        _.each(ms, function(m) {
                            mlist.push(m.uniqueName);
                        });
                        dimension.selections = _.sortBy(dimension.selections, function(selection) {
                            return _.indexOf(mlist, selection.uniqueName);
                        }); 
                    }


                    for (var sel_iter = 0; sel_iter < dimension.selections.length; sel_iter++) {
                        var selection = dimension.selections[sel_iter];
                        
                        // Drag over dimensions and measures
                        var type, name;
                        if (selection.dimensionUniqueName == "Measures") {
                            type = "measure";
                            name = selection.uniqueName;
                        } else {
                            type = "dimension";
                            name = selection.levelUniqueName;
                        }
                            
                        if (levels.indexOf(name) === -1) {
                            var $dim = $(dimension_el)
                                .find('a[rel="' + name + '"]')
                                .parent();
                            
                            if (!$dim.html() || $dim.html() == null) {
                                $dim = $(this.other_dimension)
                                .find('a[rel="' + name + '"]')
                                .parent();
                            }
                            var $clone = $dim.clone()
                                .addClass('d_' + type)
                                .appendTo($axis);
                            
                            if (type == "dimension") {
                                $("<span />").addClass('sprite selections')
                                    .prependTo($clone);
                                $icon = $("<span />").addClass('sort');
                                var sort = false;
                                _.each(axes, function(i_axis) {
                                    if (i_axis.sortLiteral && i_axis.sortLiteral != null && i_axis.sortLiteral.indexOf(selection.hierarchyUniqueName) != -1) {
                                        $icon.addClass(i_axis.sortOrder);
                                        sort = true;
                                    }
                                });
                                if (!sort) {
                                    $icon.addClass('none');
                                }
                                
                                $icon.insertBefore($clone.find('a'));
                            }

                            if (type == "measure") {
                                $icon = $("<span />").addClass('sort');
                                var sort = false;
                                _.each(axes, function(i_axis) {
                                    if (i_axis.sortLiteral && i_axis.sortLiteral != null && i_axis.sortLiteral.indexOf(name) != -1) {
                                        $icon.addClass(i_axis.sortOrder);
                                        sort = true;
                                    }
                                });
                                if (!sort) {
                                    $icon.addClass('none');
                                }
                                
                                $icon.insertBefore($clone.find('a'));
                            }

                            
                            
                            $dim.css({fontWeight: "bold"})
                                .draggable('disable')
                                .parents('.parent_dimension')
                                .find('.folder_collapsed')
                                .css({fontWeight: "bold"}); 
                            levels.push(name);
                        }
                        
                        // FIXME - something needs to be done about selections here
                    }
                }
            }
            
            this.query.run(true);
        }
        
        // Make sure appropriate workspace buttons are enabled
        this.trigger('query:new', { workspace: this });
        
        // Update caption when saved
        this.query.bind('query:save', this.update_caption);
        } else {
            this.other_dimension = dimension_el;
        }

    },
    
    update_caption: function() {
        var caption = this.query.get('name');
        $(this.tab.el).find('a').html(caption);
    },
    
   
    
    remove_dimension: function(event, ui) {
        this.drop_zones.remove_dimension(event, ui);
    }
});
