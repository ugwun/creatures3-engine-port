// -------------------------------------------------------------------------
// Filename:    CAOSTables_SubTables.cpp
// Purpose:     Sub-table OpSpec arrays used by CAOSTables.cpp.
//              Split out from CAOSTables.cpp to keep that file navigable.
//
//              Each array is extern-declared in CAOSTables.h so that
//              CAOSTables.cpp (which builds + registers the tables) can
//              reference them.  Nothing else should need to include these.
// -------------------------------------------------------------------------

#ifdef _MSC_VER
#pragma warning(disable : 4786 4503)
#endif

#include "CAOSMachine.h"
#include "CAOSTables.h"
#include "OpSpec.h"

// *** HIST sub-tables ***

OpSpec ourSubCommandTable_HIST[] = {
    OpSpec(0, "EVNT", "siss",
           "moniker event_type related_moniker_1 related_moniker_2",
           categoryHistory,
           "Triggers a life event of the given type.  Some events are "
           "triggered automatically by the engine, some events need triggering "
           "from CAOS, others are custom events that you can use for your own "
           "purposes.  See @#HIST TYPE@ for details of the event numbers.  All "
           "new events made call the @#Life Event@ script."),
    OpSpec(1, "UTXT", "sis", "moniker event_no new_value", categoryHistory,
           "For the given life event, sets the user text."),
    OpSpec(2, "NAME", "ss", "moniker new_name", categoryHistory,
           "Renames the creature with the given moniker."),
    OpSpec(3, "WIPE", "s", "moniker", categoryHistory,
           "Purge the creature history for the given moniker.  Only applies if "
           "the genome isn't referenced by any slot, and the creature is fully "
           "dead or exported.  Use @#OOWW@ to test this first."),
    OpSpec(
        4, "FOTO", "sis", "moniker event_no new_value", categoryHistory,
        "For the given life event, sets the associated photograph.  Use "
        "@#SNAP@ to take the photograph first.<p>If there was already a "
        "photograph for the event, then it is automatically marked for the "
        "attic as in @#LOFT@, and overwritten with the new photo.  Hence you "
        "can use an empty string to clear a photo.  If @#HIST WIPE@ is used to "
        "clear the event, the photo is similarly stored in the attic.<p>It is "
        "considered an error to send a photograph that is in use (unless "
        "cloned with @#TINT@) to the attic.  If this happens, you will get a "
        "runtime error.  You should either be confident that no agents are "
        "using the photo, or call @#LOFT@ first to test if they are."),
};

OpSpec ourSubIntegerRVTable_HIST[] = {
    OpSpec(0, "COUN", "s", "moniker", categoryHistory,
           "Returns the number of life events that there are for the given "
           "moniker.  Returns 0 of there are no events, or the moniker doesn't "
           "exist."),
    OpSpec(
        1, "TYPE", "si", "moniker event_no", categoryHistory,
        "For the given life event, returns its type.<p>All histories begin "
        "with one of the following four events.  You can read the associated "
        "monikers with @#HIST MON1@ and @#HIST MON2@.<br>0 Conceived - a "
        "natural start to life, associated monikers are the mother's and "
        "father's<br>1 Spliced - created using @#GENE CROS@ to crossover the "
        "two associated monikers<br>2 Engineered - from a human made genome "
        "with @#GENE LOAD@, the first associated moniker is blank, and the "
        "second is the filename<br>14 Cloned - such as when importing a "
        "creature that already exists in the world and reallocating the new "
        "moniker, when @#TWIN@ing or @#GENE CLON@ing; associated moniker is "
        "who we were cloned from<p>The following events happen during a "
        "creature's life:<br>3  Born - triggered by the @#BORN@ command, "
        "associated monikers are the parents.<br>4 Aged - reached the next "
        "life stage, either naturally from the ageing loci or with "
        "@#AGES@<br>5 Exported - emmigrated to another world<br>6 Imported - "
        "immigrated back again<br>7 Died - triggered naturally with the death "
        "trigger locus, or by the @#DEAD@ command<br>8 Became pregnant - the "
        "first associated moniker is the child, and the second the father<br>9 "
        "Impregnated - first associated moniker is the child, second the "
        "mother<br>10 Child born - first moniker is the child, second the "
        "other parent<br>15 Clone source - someone was cloned from you, first "
        "moniker is whom<p>These events aren't triggered by the engine, but "
        "reserved for CAOS to use with these numbers:<br>11 Laid by "
        "mother<br>12 Laid an egg<br>13 Photographed<p>Other numbers can also "
        "be used for custom life events.  Start with numbers 100 and above, as "
        "events below that are reserved for the engine.  You send your own "
        "events using @#HIST EVNT@."),
    OpSpec(2, "WTIK", "si", "moniker event_no", categoryHistory,
           "Returns the world tick when the life event happened, for the world "
           "that the event happened in. "),
    OpSpec(3, "TAGE", "si", "moniker event_no", categoryHistory,
           "Returns the age in ticks of the creature when the given life event "
           "happened to it.  If the creature was not in the world, wasn't born "
           "yet, or was fully dead, then -1 is returned.  If the creature was "
           "dead, but its body still in the world, then its age on death is "
           "returned.  See also @#TAGE@."),
    OpSpec(4, "RTIM", "si", "moniker event_no", categoryHistory,
           "Returns the real world time when the given life event happened.  "
           "This is measured in seconds since midnight, 1 January 1970 in UTC. "
           " To display, use @#RTIF@."),
    OpSpec(5, "CAGE", "si", "moniker event_no", categoryHistory,
           "Returns the life stage of the creature when the given life event "
           "happened."),
    OpSpec(6, "GEND", "s", "moniker", categoryHistory,
           "Returns the sex that the creature with the given moniker has or "
           "had.  1 for male, 2 for female.  If the creature hasn't been born "
           "yet, returns -1."),
    OpSpec(7, "GNUS", "s", "moniker", categoryHistory,
           "Returns the genus of the moniker.  This is 1 for Norn, 2 for "
           "Grendel, 3 for Ettin by convention."),
    OpSpec(8, "VARI", "s", "moniker", categoryHistory,
           "Returns the variant that the creature with the given moniker has "
           "or had.  If the creature hasn't been born yet, returns -1."),
    OpSpec(9, "FIND", "sii", "moniker event_type from_index", categoryHistory,
           "Searches for a life event of a certain @#HIST TYPE@ for the given "
           "moniker.  The search begins at the life event <b>after</b> the "
           "from index.  Specify -1 to find the first event.  Returns the "
           "event number, or -1 if there is no matching event."),
    OpSpec(10, "FINR", "sii", "moniker event_type from_index", categoryHistory,
           "Reverse searches for a life event of a certain @#HIST TYPE@ for "
           "the given moniker.  The search begins at the life event "
           "<b>before</b> the from index.  Specify -1 to find the last event.  "
           "Returns the event number, or -1 if there is no matching event."),
    OpSpec(11, "SEAN", "i", "world_tick", categoryTime,
           "Returns the current season for a given world tick.  This is the "
           "same as @#SEAN@.  See also @#WTIK@ and @#HIST WTIK@."),
    OpSpec(12, "TIME", "i", "world_tick", categoryTime,
           "Returns the time of day for a given world tick.  This is the same "
           "as @#TIME@.  See also @#WTIK@ and @#HIST WTIK@."),
    OpSpec(13, "YEAR", "i", "world_tick", categoryTime,
           "Returns the number of game years elapsed for a given world tick.  "
           "This is the same as @#YEAR@.  See also @#WTIK@ and @#HIST WTIK@."),
    OpSpec(14, "DATE", "i", "world_tick", categoryTime,
           "Returns the day within the current season.  This is the same as "
           "@#DATE@.  See also @#WTIK@ and @#HIST WTIK@."),
    OpSpec(15, "MUTE", "s", "moniker", categoryHistory,
           "Returns the number of point mutations the genome received during "
           "crossover from its parents."),
    OpSpec(16, "CROS", "s", "moniker", categoryHistory,
           "Returns the number of crossover points when the genome was made by "
           "splicing its parents genomes."),
    // DS-specific: whether a creature's history was verified (online feature).
    // Stub returns 0 (unverified) for the offline macOS port.
    OpSpec(17, "WVET", "s", "moniker", categoryHistory,
           "DS: Returns 1 if the given creature's history was online-verified, "
           "0 otherwise. Offline stub returns 0."),
};

OpSpec ourSubStringRVTable_HIST[] = {
    OpSpec(0, "MON1", "si", "moniker event_no", categoryHistory,
           "For the given life event, returns the first associated moniker."),
    OpSpec(1, "MON2", "si", "moniker event_no", categoryHistory,
           "For the given life event, returns the second associated moniker."),
    OpSpec(2, "UTXT", "si", "moniker event_no", categoryHistory,
           "For the given life event, returns the user text."),
    OpSpec(3, "WNAM", "si", "moniker event_no", categoryHistory,
           "Returns the name of the world the given life event happened in."),
    OpSpec(4, "WUID", "si", "moniker event_no", categoryHistory,
           "Returns the unique identifier of the world the given life event "
           "happened in."),
    OpSpec(5, "NAME", "s", "moniker", categoryHistory,
           "Returns the name of the creature with the given moniker."),
    OpSpec(6, "NEXT", "s", "moniker", categoryHistory,
           "Returns the next moniker which has a history, or an empty string "
           "if we're at the end already.  If the specified moniker is an empty "
           "string or doesn't have a history, then the first moniker with a "
           "history entry is returned, or an empty string if there isn't one."),
    OpSpec(7, "PREV", "s", "moniker", categoryHistory,
           "Returns the previous moniker which has a history.  If the "
           "specified moniker is an empty string or doesn't have a history, "
           "then the last moniker with a history entry is returned, or an "
           "empty string if there isn't one."),
    OpSpec(8, "FOTO", "si", "moniker event_no", categoryHistory,
           "For the given life event, returns the filename of the associated "
           "photograph, or an empty string if there is no photo."),
    // DS: HIST NETU moniker event_no - online network-user associated with a
    // creature life event. Scripts call `hist netu ov01 0` ("si" signature like
    // FOTO). Offline stub returns "" (no online account info).
    OpSpec(
        9, "NETU", "si", "moniker event_no", categoryHistory,
        "DS: Returns the network username associated with the given "
        "creature moniker at the given life event. Offline stub returns \"\"."),
};

// *** FILE sub-tables ***

OpSpec ourSubCommandTable_FILE[] = {
    OpSpec(
        0, "OOPE", "isi", "directory filename append", categoryFiles,
        "Sets the file for the output stream of the current virtual machine - "
        "there is a virtual machine for each agent, so this is much the same "
        "as setting it for @#OWNR@.  Use @#OUTV@ and @#OUTS@ or various other "
        "commands to send text data to the stream.  The filename should "
        "include any file extension.<p>You should use @#FILE OCLO@ to close "
        "the file, although this happens automatically if you set a new file, "
        "if the virtual machine is destroyed, or if the engine "
        "exits.<p>Directory is 0 for the current world's journal directory, or "
        "1 for the main journal directory.  Set append to 1 to add to the end "
        "of the file, or 0 to replace any existing file."),
    OpSpec(1, "OCLO", "", "", categoryFiles,
           "Disconnects anything which is attached to the output stream.  If "
           "this is a file, then the file is closed."),
    OpSpec(2, "OFLU", "", "", categoryFiles,
           "Flush output stream.  If it is attached to a disk file, this will "
           "force any data in the buffer to be written to disk."),
    OpSpec(
        3, "IOPE", "is", "directory filename", categoryFiles,
        "Sets the file for the input stream of the current virtual machine - "
        "there is a virtual machine for each agent, so this is much the same "
        "as setting it for @#OWNR@.  Use @#INNL@, @#INNI@ and @#INNF@ to get "
        "data from the stream, and @#INOK@ to check validity of the stream.  "
        "The filename should include any file extension.<p>You should use "
        "@#FILE ICLO@ to close the file, although this happens automatically "
        "if you set a new file, if the virtual machine is destroyed, or if the "
        "engine exits.<p>Directory is 0 for the current world's journal "
        "directory, or 1 for the main journal directory."),
    OpSpec(4, "ICLO", "", "", categoryFiles,
           "Disconnects anything which is attached to the input stream.  If "
           "this is a file, then the file is closed."),
    OpSpec(
        5, "JDEL", "is", "directory filename", categoryFiles,
        "This deletes the file (filename) specified from the journal directory "
        "specified. If directory is zero, this is the current world's journal "
        "directory, otherwise it is the main journal directory.  It deletes "
        "the file immediately, rather than marking it for the attic."),
};

// *** GENE sub-tables ***

OpSpec ourSubCommandTable_GENE[] = {
    OpSpec(0, "CROS", "aiaiaiiiii",
           "child_agent child_slot mum_agent mum_slot dad_agent dad_slot "
           "mum_chance_of_mutation mum_degree_of_mutation "
           "dad_chance_of_mutation dad_degree_of_mutation.",
           categoryGenetics,
           "Crosses two genomes with mutation, and fills in a child geneme "
           "slot.  Mutation variables may be in the range of 0 to 255."),
    OpSpec(1, "MOVE", "aiai", "dest_agent dest_slot source_agent source_slot",
           categoryGenetics, "Moves a genome from one slot to another."),
    OpSpec(2, "KILL", "ai", "agent slot", categoryGenetics,
           "Clears a genome slot."),
    OpSpec(
        3, "LOAD", "ais", "agent slot gene_file", categoryGenetics,
        "Loads an engineered gene file into a slot.  Slot 0 is a special slot "
        "used only for creatures, and contains the moniker they express.  Only "
        "the @#NEW: CREA@ command fills it in.  Other slot numbers are used in "
        "pregnant creatures, in eggs, or to temporarily store a genome before "
        "expressing it with @#NEW: CREA@.  You can use them as general purpose "
        "genome stores.<p>The gene file can have any name, and is loaded from "
        "the main genetics file.  A new moniker is generated, and a copy of "
        "the gene file put in the world directory. You can use * and ? "
        "wildcards in the name, and a random matching file will be used.<p>You "
        "can also load monikered files from the world genetics directory with "
        "this command.  If so, the file is copied and a new moniker generated. "
        " Wildcards are matched first in the main genetics directory, and only "
        "if none match is the world genetics directory searched."),
    OpSpec(4, "CLON", "aiai", "dest_agent dest_slot source_agent source_slot",
           categoryGenetics,
           "Clones a genome, creating a new moniker and copying the genetics "
           "file."),
};

// *** PRAY sub-tables ***

OpSpec ourSubCommandTable_PRAY[] = {
    OpSpec(0, "REFR", "", "", categoryResources,
           "This command refreshes the engine's view of the Resource "
           "directory. Execute this if you have reason to believe that the "
           "files in the directory may have changed. This forces a @#PRAY "
           "GARB@ to happen automatically"),
    OpSpec(
        1, "GARB", "i", "force", categoryResources,
        "This command clears the manager's cached resource data. Execute this "
        "after a lot of resource accesses (E.g. installing an agent) to clean "
        "up the memory used during the process. If you don't do this, excess "
        "memory can be held for a while, If the parameter is zero (the most "
        "usual) then the manager will only forget resources which are not in "
        "use at the moment. If force is non-zero, then the manager will forget "
        "all the previously loaded resources. As the resources currently in "
        "use go out of scope, they are automatically garbage collected."),
};

OpSpec ourSubIntegerRVTable_PRAY[] = {
    OpSpec(0, "COUN", "s", "resource_type", categoryResources,
           "This returns the number of resource chunks which are tagged with "
           "the resource type passed in. Resource types are four characters "
           "only. Anything over that length will be silently truncated."),
    OpSpec(1, "AGTI", "ssi", "resource_name integer_tag default_value",
           categoryResources,
           "This returns the value of the integer tag associated with the "
           "named resource. If the resource does not contain such a tag, then "
           "the default value specified is returned. This call pairs with "
           "@#PRAY AGTS@."),
    OpSpec(
        2, "DEPS", "si", "resource_name do_install", categoryResources,
        "This performs a scan of the specified resource, and checks out the "
        "dependency data. The primary use for this would be in the preparation "
        "for injection of agents. If you pass zero in the do_install "
        "parameter, then the dependencies are only checked. If do_install is "
        "non-zero, then they are installed also. The return values are as "
        "follows:<br>0 = Success<br>-1 = Agent Type not found<br>-2 = "
        "Dependency Count not found<br>-3 to -(2 + count) is the dependency "
        "string missing<br>-(3+count) to -(2+2*count) is the dependency type "
        "missing<br>2*count to 3*count is the category ID for that dependency "
        "being invalid<br>1 to count is the dependency failing"),
    OpSpec(
        3, "FILE", "sii", "resource_name resource_type do_install",
        categoryResources,
        "This performs the \"installation\" of one file from the resource "
        "files. The resource_type is defined in the agent resource guide. If "
        "do_install is zero, the command simply checks if the file install "
        "should succeed. Return value is 0 for success, 1 for error."),
    OpSpec(4, "TEST", "s", "resource_name", categoryResources,
           "This checks for the existence of a chunk, returning zero if it is "
           "not found, and a value from 1-3 indicating the cost to load if it "
           "is.<br>Return values are currently defined as:<br>0 - Chunk not "
           "available at this time<br>1 - Chunk Available, Cached and ready "
           "for use<br>2 - Chunk available, on disk uncompressed and fine for "
           "loading<br>3 - Chunk available, on disk compressed and ready for "
           "loading. <p>Thus the return value could be thought of as the cost "
           "of loading, where 1 is no cost, and 3 is high cost."),
    OpSpec(
        5, "INJT", "siv", "resource_name do_install report_var",
        categoryResources,
        "This command injects an agent. The agent must be in the chunk named. "
        "If do_install is zero, the command simply checks for the presence of "
        "the required scripts and dependencies. If non-zero, it attempts to "
        "inject the agent. The report var is a string variable, and is set to "
        "the name of the offending script if the injection/check fails. "
        "<br>Return is 0 for success, -1 for \"Script not found\" and if "
        "injecting, -2 for \"Injection failed\". <br>Return value -3 indicates "
        "that a dependency evaluation failed, and in this case, the report var "
        "is the return code from @#PRAY DEPS@"),
    OpSpec(
        6, "SIZE", "s", "resource_name", categoryResources,
        "The return value for this is the size of the chunk. This can be used "
        "to determine chunk information for decisions on time criteria. E.g. a "
        "large compressed chunk will take a short while to decompress."),
    OpSpec(
        7, "EXPO", "s", "chunk_name", categoryResources,
        "This function exports the target creature. If the creature is "
        "exported successfully then it has been removed from the world. "
        "Returns value is one of the following:<br>0 for success<br>1 if the "
        "creature, or if pregnant any of its offspring, are already on disk in "
        "some form.<p>The chunk name should be used to find the creature again "
        "to import it.  In Creatures 3, most exported creatures have a chunk "
        "name EXPC, and the starter family uses SFAM."),
    OpSpec(
        8, "IMPO", "sii", "moniker actually_do_it keep_file", categoryResources,
        "This function imports the creature with the requested moniker. "
        "Returns one of the following codes:<br>0 - success<br>1 - couldn't "
        "reconcile histories so creature was cloned<br>2 - moniker not found "
        "in PRAY system<br>3 - related genome files could not be loaded<p>Set "
        "actually_do_it to 1 to try and perform the import, or 0 to perform a "
        "query giving just the return value.  You can use the query to test if "
        "the creature is available, and if the creature would have to be "
        "cloned upon importing, and warn the user.  The new creature is "
        "@#TARG@etted after import.  If you set keep file to 1, then the "
        "exported file won't be deleted (moved to the porch)."),
    // DS: PRAY KILL moniker - cancel a pending PRAY download. Used as an
    // integer RV in scripts: setv va99 pray kill va00. Offline stub returns 0.
    OpSpec(9, "MAKE", "isisv",
           "which_journal_spot journal_name which_pray_spot pray_name "
           "report_destination",
           categoryResources,
           "<b>Please see the documentation accompanying the praybuilder on "
           "CDN</b><p>Suffice it to say: return value is zero for success, "
           "otherwise non-zero, and report is set to the praybuilder output "
           "for you<p>Also, the which_journal_spot is zero for world journal, "
           "1 for global journal. Also the which_pray_spot is zero for \"My "
           "Agents\" and 1 for \"My Creatures\""),
    // DS: PRAY KILL moniker - cancel a pending PRAY download. Used as an
    // integer RV in scripts: setv va99 pray kill va00. Offline stub returns 0.
    OpSpec(10, "KILL", "s", "moniker", categoryResources,
           "DS: Cancel a pending PRAY download for the given moniker. "
           "Returns 0 (success) always in the offline port."),
};

OpSpec ourSubStringRVTable_PRAY[] = {
    OpSpec(0, "PREV", "ss", "resource_type last_known", categoryResources,
           "This returns the name of the resource chunk directly before the "
           "named one, given that they are of the same type. If the named "
           "resource cannot be found in the list of resources of the type "
           "specified, then the first resource of that type is returned. This "
           "call pairs with @#PRAY NEXT@."),
    OpSpec(1, "NEXT", "ss", "resource_type last_known", categoryResources,
           "This returns the name of the resource chunk directly after the "
           "named one, given that they are of the same type. If the named "
           "resource cannot be found in the list of resources of the type "
           "specified, then the last resource of that type is returned. This "
           "call pairs with @#PRAY PREV@."),
    OpSpec(2, "AGTS", "sss", "resource_name string_tag default_value",
           categoryResources,
           "This returns the value of the string tag associated with the named "
           "resource. If the resource does not contain such a tag, then the "
           "default value specified is returned. This call pairs with @#PRAY "
           "AGTI@."),
    // DS: PRAY FORE resource_type last_known - forward-iterate PRAY resource
    // list. Equivalent to PRAY NEXT but used in DS bootstrap scripts.
    OpSpec(
        3, "FORE", "ss", "resource_type last_known", categoryResources,
        "DS: Returns the name of the next resource chunk after the named one.  "
        "Equivalent to @#PRAY NEXT@.  Returns empty string if none found."),
    // DS: PRAY BACK resource_type last_known - backward-iterate PRAY resource
    // list. Used as a string RV: sets ov99 pray back ov84 ov99.
    // Offline stub returns "" (no online resources to iterate).
    OpSpec(
        4, "BACK", "ss", "resource_type last_known", categoryResources,
        "DS: Returns the name of the previous resource chunk before the named "
        "one. Offline stub returns \"\"."),
};

// *** NEW sub-tables ***

OpSpec ourSubCommandTable_NEW[] = {
    OpSpec(0, "SIMP", "iiisiii",
           "family genus species sprite_file image_count first_image plane",
           categoryAgents,
           "Create a new simple agent, using the specified sprite file. The "
           "agent will have image_count sprites available, starting at "
           "first_image in the file. The plane is the screen depth to show the "
           "agent at - the higher the number, the nearer the camera."),
    OpSpec(
        1, "COMP", "iiisiii",
        "family genus species sprite_file image_count first_image plane",
        categoryCompound,
        "Create a new compound agent. The sprite file is for the first part, "
        "which is made automatically.  Similarly, image_count and first_image "
        "are for that first part.  The plane is the absolute plane of part 1 - "
        "the planes of other parts are relative to the first part."),
    OpSpec(2, "VHCL", "iiisiii",
           "family genus species sprite_file image_count first_image plane",
           categoryVehicles,
           "Create a new vehicle.  Parameters are the same as @#NEW: COMP@."),
    OpSpec(3, "CREA", "iaiii", "family gene_agent gene_slot sex variant",
           categoryCreatures,
           "Makes a creature using the genome from the given gene slot in "
           "another agent.  You'll want to use @#GENE CROS@ or @#GENE LOAD@ to "
           "fill that slot in first.  The gene slot is cleared, as control of "
           "that genome is moved to the special slot 0 of the new creature, "
           "where it is expressed.  Sex is 1 for male, 2 for female or 0 for "
           "random.  The variant can also be 0 for a random value between 1 "
           "and 8.  See also @#NEWC@."),
};

// *** MESG sub-tables ***

OpSpec ourSubCommandTable_MESG[] = {
    OpSpec(
        0, "WRIT", "ai", "agent message_id", categoryAgents,
        "Send a message to another agent.  The message_id is from the table of "
        "@#Message Numbers@; remember that early @#Message Numbers@ differ "
        "slightly from @#Script Numbers@.  If used from an install script, "
        "then @#FROM@ for the message to @#NULL@ rather than @#OWNR@."),
    OpSpec(1, "WRT+", "aimmi", "agent message_id param_1 param_2 delay",
           categoryAgents,
           "Send a message with parameters to another agent.  Waits delay "
           "ticks before sending the message.  The message_id is from the "
           "table of @#Message Numbers@."),
};

// *** STIM sub-tables ***

OpSpec ourSubCommandTable_STIM[] = {
    OpSpec(
        0, "SHOU", "if", "stimulus strength", categoryCreatures,
        "Shout a stimulus to all creatures who can hear @#OWNR@.  The strength "
        "is a multiplier for the stimulus.  Set to 1 for a default "
        "stimulation, 2 for a stronger stimulation and so on.  It is important "
        "you use this, rather than send several stims, as it affects learning. "
        " Set strength to 0 to prevent learning altogether, and send a "
        "strength 1 chemical change.  See the table of @#Stimulus Numbers@."),
    OpSpec(1, "SIGN", "if", "stimulus strength", categoryCreatures,
           "Send a stimulus to all creatures who can see @#OWNR@."),
    OpSpec(2, "TACT", "if", "stimulus strength", categoryCreatures,
           "Send a stimulus to all creatures who are touching @#OWNR@."),
    OpSpec(3, "WRIT", "aif", "creature stimulus strength", categoryCreatures,
           "Send stimulus to a specific creature.  Can be used from an install "
           "script, but the stimulus will be from @#NULL@, so the creature "
           "will react but not learn."),
};

// *** URGE sub-tables ***

OpSpec ourSubCommandTable_URGE[] = {
    OpSpec(0, "SHOU", "fif", "noun_stim verb_id verb_stim", categoryCreatures,
           "Urge all creatures who can hear @#OWNR@ to perform the verb_id "
           "action on @#OWNR@.  Stimuli can range from -1 to 1, ranging from "
           "discourage to encourage."),
    OpSpec(1, "SIGN", "fif", "noun_stim verb_id verb_stim", categoryCreatures,
           "Urge all creatures who can see @#OWNR@ to perform an action on "
           "@#OWNR@."),
    OpSpec(2, "TACT", "fif", "noun_stim verb_id verb_stim", categoryCreatures,
           "Urge all creatures who are touching @#OWNR@ to perform an action "
           "on @#OWNR@."),
    OpSpec(3, "WRIT", "aifif", "creature noun_id noun_stim verb_id verb_stim",
           categoryCreatures,
           "Urge a specific creature to perform a specific action on a "
           "specific noun.  A stimulus greater than 1 will <i>force</i> the "
           "Creature to perform an action, or to set its attention (mind "
           "control!).  Use an id -1 and stim greater than 1 to unforce it."),
};

// *** SWAY sub-tables ***

OpSpec ourSubCommandTable_SWAY[] = {
    OpSpec(0, "SHOU", "ifififif",
           "drive adjust drive adjust drive adjust drive adjust",
           categoryCreatures,
           "Stimulate all creatures that can hear @#OWNR@ to adjust four "
           "drives by the given amounts."),
    OpSpec(1, "SIGN", "ifififif",
           "drive adjust drive adjust drive adjust drive adjust",
           categoryCreatures,
           "Stimulate all creatures that can see @#OWNR@ to adjust four drives "
           "by the given amounts."),
    OpSpec(2, "TACT", "ifififif",
           "drive adjust drive adjust drive adjust drive adjust",
           categoryCreatures,
           "Stimulate all creatures that are touching @#OWNR@ to adjust four "
           "drives by the given amounts."),
    OpSpec(3, "WRIT", "aifififif",
           "creature drive adjust drive adjust drive adjust drive adjust",
           categoryCreatures,
           "Stimulate a specific creature to adjust four drives by the given "
           "amounts."),
};

// *** ORDR sub-tables ***

OpSpec ourSubCommandTable_ORDR[] = {
    OpSpec(0, "SHOU", "s", "speech", categoryCreatures,
           "Sends a spoken command from target to all creatures that can hear "
           "it."),
    OpSpec(
        1, "SIGN", "s", "speech", categoryCreatures,
        "Sends a spoken command from target to all creatures that can see it."),
    OpSpec(2, "TACT", "s", "speech", categoryCreatures,
           "Sends a spoken command from target to all creatures that are "
           "touching it."),
    OpSpec(3, "WRIT", "as", "creature speech", categoryCreatures,
           "Sends a spoken command from target to the specified creature."),
};

// *** GIDS sub-tables ***

OpSpec ourSubCommandTable_GIDS[] = {
    OpSpec(0, "ROOT", "", "", categoryScripts,
           "Output the family numbers for which there are scripts in the "
           "scriptorium.  List is space delimited."),
    OpSpec(1, "FMLY", "i", "family", categoryScripts,
           "Output the genus numbers for which there are scripts in the "
           "scriptorium for the given family.  List is space delimited."),
    OpSpec(2, "GNUS", "ii", "family genus", categoryScripts,
           "Output the species numbers for which there are scripts in the "
           "scriptorium for the given family and genus.  List is space "
           "delimited."),
    OpSpec(3, "SPCS", "iii", "family genus species", categoryScripts,
           "Output the event numbers of scripts in the scriptorium for the "
           "given family and genus.  List is space delimited."),
};

// *** PRT sub-tables ***

OpSpec ourSubCommandTable_PRT[] = {
    OpSpec(
        0, "INEW", "issiii", "id name description x y message_num",
        categoryPorts,
        "Create a new input port on target. You should number input port ids "
        "starting at 0.  The message_num is the message that will be sent to "
        "the agent when a signal comes in through the input port. _P1_ of that "
        "message will contain the data value of the signal. The position of "
        "the port, relative to the agent, is given by x, y."),
    OpSpec(1, "IZAP", "i", "id", categoryPorts,
           "Remove the specified input port."),
    OpSpec(
        2, "ONEW", "issii", "id name description x y", categoryPorts,
        "Create a new output port on target. You should number input port ids "
        "starting at 0.  The port's relative position is given by x, y."),
    OpSpec(3, "OZAP", "i", "id", categoryPorts,
           "Remove the specified output port."),
    OpSpec(4, "JOIN", "aiai", "source_agent output_id dest_agent input_id",
           categoryPorts,
           "Connect an output port on the source agent to an input port on the "
           "destination. An input may only be connected to one output at at "
           "time, but an output may feed any number of inputs."),
    OpSpec(5, "SEND", "im", "id data", categoryPorts,
           "Send a signal from the specified output port to all connected "
           "inputs.  The data can be any integer."),
    OpSpec(6, "BANG", "i", "bang_strength", categoryPorts,
           "Breaks connections randomly with other machines (as if the machine "
           "had been 'banged'. Use a bang_strength of 100 to disconnect all "
           "ports, 50 to disconnect about half etc."),
    OpSpec(7, "KRAK", "aii", "agent in_or_out port_index", categoryPorts,
           "Breaks a specific connection on a machine. If in_or_out is zero, "
           "it is an input port whose connection is broken, if it is an output "
           "port, then all inputs are disconnected."),
};

OpSpec ourSubIntegerRVTable_PRT[] = {
    OpSpec(0, "ITOT", "", "", categoryPorts,
           "Returns the number of input ports, assuming they are indexed "
           "sequentially."),
    OpSpec(1, "OTOT", "", "", categoryPorts,
           "Returns the number of output ports, assuming they are indexed "
           "sequentially."),
    OpSpec(
        2, "FROM", "i", "inputport", categoryPorts,
        "Returns the output port index on the source agent, feeding that input "
        "port on the @#TARG@ agent.<br>Return values are -ve for error."),
};

OpSpec ourSubStringRVTable_PRT[] = {
    OpSpec(0, "NAME", "aii", "agent in_or_out port_index", categoryPorts,
           "Returns the name of the indexed port (input port if in_or_out is "
           "zero, output port if non-zero) on the specified agent. Returns "
           "\"\" in error."),
};

OpSpec ourSubAgentRVTable_PRT[] = {
    OpSpec(0, "FRMA", "i", "inputport", categoryPorts,
           "Returns the agent from which the input port is fed. Returns "
           "NULLHANDLE if that port does not exist, or is not connected."),
};

// *** PAT sub-tables ***

OpSpec ourSubCommandTable_PAT[] = {
    OpSpec(0, "DULL", "isiddi",
           "part_id sprite_file first_image rel_x rel_y rel_plane",
           categoryCompound,
           "Create a dull part for a compound agent.  A dull part does nothing "
           "except show an image from the given sprite file.  You should "
           "number part ids starting at 1, as part 0 is automatically made "
           "when the agent is made.  The dull part's position is relative to "
           "part 0, as is its plane.  Use @#PART@ to select it before you "
           "change @#POSE@ or @#ANIM@, or use various other commands."),
    OpSpec(
        1, "BUTT", "isiiddibii",
        "part_id sprite_file first_image image_count rel_x rel_y rel_plane "
        "anim_hover message_id option",
        categoryCompound,
        "Create a button on a compound agent.  anim_hover is an animation, as "
        "in the @#ANIM@ command, to use when the mouse is over the button - "
        "when the mouse is moved off, it returns to any previous animation "
        "that was going.  message_id is sent when the button is clicked.  "
        "option is 0 for the mouse to hit anywhere in the bounding box, 1 to "
        "hit only non-transparent pixels.<br>@#_P1_@ of the message is set to "
        "the part number of the buttons allowing you to overload your messages "
        "by button group and then switch on input value in the script."),
    OpSpec(2, "TEXT", "isiddiis",
           "part_id sprite_file first_image rel_x rel_y rel_plane message_id "
           "font_sprite",
           categoryCompound,
           "Creates a text entry part.  Gains the focus when you click on it, "
           "or with the @#FCUS@ command.  Sends the message_id when tab or "
           "return are pressed - a good place to use @#PTXT@ to get the text "
           "out, and to set the focus elsewhere."),
    OpSpec(3, "FIXD", "isiddis",
           "part_id sprite_file first_image rel_x rel_y rel_plane font_sprite",
           categoryCompound,
           "Create a fixed text part. The text is wrapped on top of the "
           "supplied gallery image. new-line characters may be used.  Use "
           "@#PTXT@ to set the text."),
    OpSpec(4, "CMRA", "isiddiiiii",
           "part_id overlay_sprite baseimage relx rely relplane viewWidth "
           "viewHeight cameraWidth cameraHeight",
           categoryCompound,
           "Create a camera with possible overlay sprite whose name may be "
           "blank.  Use @#SCAM@ to change the camera's view."),
    OpSpec(5, "GRPH", "isiddii",
           "part_id overlay_sprite baseimage relx rely relplane numValues",
           categoryCompound,
           "Creates a graph part on a compound agent. Use @#GRPL@ to add a "
           "line to the graph and @#GRPV@ to add a value to a graph line."),
    OpSpec(6, "KILL", "i", "part_id", categoryCompound,
           "Destroys the specified part of a compound agent.  You can't "
           "destroy part 0."),
    OpSpec(7, "MOVE", "iii", "part_id rel_x rel_y", categoryCompound,
           "Move a part of a compound agent to a new relative position "
           "within the parent agent."),
};

// *** BRN sub-tables ***

OpSpec ourSubCommandTable_BRN[] = {
    OpSpec(0, "SETN", "iiif",
           "lobe_number neuron_number state_number new_value", categoryBrain,
           "Sets a neuron weight."),
    OpSpec(1, "SETD", "iiif",
           "tract_number dendrite_number weight_number new_value",
           categoryBrain, "Sets a dendrite weight."),
    OpSpec(2, "SETL", "iif", "lobe_number line_number new_value", categoryBrain,
           "Sets a lobe's SV rule float value."),
    OpSpec(3, "SETT", "iif", "tract_number line_number new_value",
           categoryBrain, "Sets a tract's SV rule float value."),
    OpSpec(4, "DMPB", "", "", categoryBrain,
           "Dumps the sizes of the binary data dumps for current lobes and "
           "tracts."),
    OpSpec(5, "DMPL", "i", "lobe_number", categoryBrain,
           "Dumps a lobe as binary data."),
    OpSpec(6, "DMPT", "i", "tract_number", categoryBrain,
           "Dumps a tract as binary data."),
    OpSpec(7, "DMPN", "ii", "lobe_number neuron_number", categoryBrain,
           "Dumps a neuron as binary data."),
    OpSpec(8, "DMPD", "ii", "tract_number dendrite_number", categoryBrain,
           "Dumps a dendrite as binary data."),
};

// *** DBG sub-tables ***

OpSpec ourSubCommandTable_DBG[] = {
    OpSpec(0, "PAWS", "", "", categoryDebug,
           "This pauses everything in the game. No game driven ticks will "
           "occur until a @#DBG: PLAY@ command is issued, so this command is "
           "only useful for debugging.  Use @#PAUS@ for pausing of specific "
           "agents, which you can use to implement a pause button."),
    OpSpec(1, "PLAY", "", "", categoryDebug,
           "This command undoes a previously given @#DBG: PAWS@ and allows "
           "game time to flow as normal."),
    OpSpec(2, "TOCK", "", "", categoryDebug,
           "This command forces a tick to occur. It is useful in external apps "
           "to drive the game according to a different clock instead of the "
           "game clock."),
    OpSpec(3, "FLSH", "", "", categoryDebug,
           "This flushes the system's input buffers - usually only useful if "
           "@#DBG: PAWS@ed."),
    OpSpec(4, "POLL", "", "", categoryDebug,
           "This takes all of the @#DBG: OUTV@ and @#DBG: OUTS@ output to date "
           "and writes it to the output stream."),
    OpSpec(5, "OUTV", "d", "value", categoryDebug,
           "Send a number to the debug log - use @#DBG: POLL@ to retrieve."),
    OpSpec(6, "OUTS", "s", "value", categoryDebug,
           "Send a string to the debug log - use @#DBG: POLL@ to retrieve."),
    OpSpec(7, "PROF", "", "", categoryDebug,
           "Sends agent profile information to the output stream.  This gives "
           "you data about the time the engine spends running the update and "
           "message handling code for each classifier.  The data is measured "
           "from engine startup, or the point marked with @#DBG: CPRO@.  It's "
           "output in comma separated value (CSV) format, so you can load it "
           "into a spreadsheet for sorting and summing."),
    OpSpec(8, "CPRO", "", "", categoryDebug,
           "Clears agent profiling information.  Measurements output with "
           "@#DBG: PROF@ start here."),
    OpSpec(9, "HTML", "i", "sort_order", categoryDebug,
           "Sends CAOS documentation to the output stream.  Sort order is 0 "
           "for alphabetical, 1 for categorical."),
    OpSpec(10, "ASRT", "c", "condition", categoryDebug,
           "Confirms that a condition is true.  If it isn't, it displays a "
           "runtime error dialog."),
    OpSpec(11, "WTIK", "i", "new_world_tick", categoryDebug,
           "Changes the world tick @#WTIK@ to the given value.  This should "
           "only be used for debugging, as it will potentially leave confusing "
           "information in the creature history, and change the time when "
           "delayed messages are processed.  Its main use is to jump to "
           "different seasons and times of day."),
    OpSpec(12, "TACK", "a", "follow", categoryDebug,
           "Pauses the game when the given agent next executes a single line "
           "of CAOS code.  This pause is mid-tick, and awaits incoming "
           "requests, or the pause key.  Either another DBG: TACK or a @#DBG: "
           "PLAY@ command will make the engine carry on.  Any other incoming "
           "requests will be processed as normal.  However, the virtual "
           "machine of the tacking agent is effectively in mid-processing, so "
           "some CAOS commands may cause unpredictable results, and even crash "
           "the engine.  In particular, you shouldn't @#KILL@ the tacking "
           "agent.  You can see which agent is being tracked with @#TACK@."),
};

// *** NET sub-tables ***
// DS online-only networking commands — all offline stubs.

// Dummy handlers for typed RV sub-table entries.
// These must be non-static so they can be referenced from CAOSTables.cpp.
int NetDummyIntegerRV(CAOSMachine &vm) { return 0; }
void NetDummyStringRV(CAOSMachine &vm, std::string &str) { str = ""; }

OpSpec ourSubCommandTable_NET[] = {
    OpSpec(0, "HEAR", "s", "channel", categoryAgents,
           "DS: Listen for online messages on a channel. Offline stub."),
    OpSpec(1, "HOST", "s", "host", categoryAgents,
           "DS: Set DS server host. Offline stub."),
    OpSpec(2, "RUSO", "i", "value", categoryAgents,
           "DS: Set user online state. Offline stub."),
    OpSpec(3, "PASS", "ss", "username password", categoryAgents,
           "DS: DS login with username and password. Offline stub."),
    OpSpec(4, "MAKE", "is", "type channel", categoryAgents,
           "DS: Create/join an online channel. Offline stub."),
    OpSpec(5, "ULIN", "s", "username", categoryAgents,
           "DS: Returns online status of user by username. Offline stub "
           "returns 0."),
    OpSpec(6, "LINE", "i", "state", categoryAgents,
           "DS: Go online (1) or offline (0). Offline stub: no-op."),
    OpSpec(7, "WHOZ", "", "", categoryAgents,
           "DS: Query who is online. Offline stub: no-op."),
    OpSpec(8, "WHON", "s", "user_id", categoryAgents,
           "DS: Notify of online user. Offline stub: no-op."),
    OpSpec(9, "MOVE", "", "", categoryAgents,
           "DS: Move to next network message. Offline stub: no-op."),
    OpSpec(10, "STAT", "vvvv", "out1 out2 out3 out4", categoryAgents,
           "DS: Dump connection statistics into 4 output variables. Offline "
           "stub: no-op."),
    OpSpec(11, "UNIK", "si", "user_id out_var", categoryAgents,
           "DS: Get unique ID for a user. Offline stub: no-op."),
    OpSpec(12, "WHOF", "s", "user_id", categoryAgents,
           "DS: Stop tracking a user online. Offline stub: no-op."),
};

OpSpec ourSubIntegerRVTable_NET[] = {
    // IMPORTANT: Use specialCode=0 for all entries. The 4th int argument in
    // OpSpec(name, handler, params, int, helpparams, category, help) sets
    // mySpecialCode. Non-zero values accidentally trigger block processing
    // (e.g., 2=specialELIF, 3=specialELSE, 4=specialENDI).
    OpSpec("LINE", NetDummyIntegerRV, "", 0, "", categoryAgents,
           "DS: Returns DS connection status. Offline stub returns 0."),
    OpSpec("EXPO", NetDummyIntegerRV, "ss", 0, "channel user_id",
           categoryAgents,
           "DS: Exports a creature resource to user_id via channel. Returns "
           "result code. Offline stub returns 0."),
    OpSpec("ULIN", NetDummyIntegerRV, "s", 0, "username", categoryAgents,
           "DS: Returns online status of the given username. Offline stub "
           "returns 0."),
    OpSpec("MAKE", NetDummyIntegerRV, "ismv", 0,
           "type channel recipient status_var", categoryAgents,
           "DS: Creates a network channel packet. type=0, channel=filename, "
           "recipient=user or NAME variable, status_var receives status. "
           "Returns result. Offline stub returns 0."),
    OpSpec("STAT", NetDummyIntegerRV, "iiii", 0, "a b c d", categoryAgents,
           "DS: Returns DS connection statistics as 4 integers. Offline stub "
           "returns 0s."),
    OpSpec("ERRA", NetDummyIntegerRV, "", 0, "", categoryAgents,
           "DS: Returns last DS network error code. Offline stub returns 0."),
    OpSpec(
        "PASS", NetDummyIntegerRV, "", 0, "", categoryAgents,
        "DS: Returns password authentication result. Offline stub returns 0."),
};

OpSpec ourSubStringRVTable_NET[] = {
    // IMPORTANT: Use specialCode=0 for all entries. See comment in
    // ourSubIntegerRVTable_NET above for explanation.
    OpSpec("USER", NetDummyStringRV, "", 0, "", categoryAgents,
           "DS: Returns DS username. Offline stub returns \"\"."),
    OpSpec("FROM", NetDummyStringRV, "i", 0, "message_id", categoryAgents,
           "DS: Returns DS message sender. Offline stub returns \"\"."),
    OpSpec(
        "WHAT", NetDummyStringRV, "", 0, "", categoryAgents,
        "DS: Returns DS current message content. Offline stub returns \"\"."),
    OpSpec("WHOF", NetDummyStringRV, "", 0, "", categoryAgents,
           "DS: Returns DS follower list. Offline stub returns \"\"."),
    OpSpec("UNIK", NetDummyStringRV, "i", 0, "user_id", categoryAgents,
           "DS: Returns user unique ID. Offline stub returns \"\"."),
    OpSpec("HOST", NetDummyStringRV, "", 0, "", categoryAgents,
           "DS: Returns current DS server host. Offline stub returns \"\"."),
};

// *** Element counts for extern sub-tables (used in CAOSTables.cpp) ***
int kSubCommandTable_HIST_COUNT = 5;
int kSubIntegerRVTable_HIST_COUNT = 18;
int kSubStringRVTable_HIST_COUNT = 10;
int kSubCommandTable_FILE_COUNT = 6;
int kSubCommandTable_GENE_COUNT = 5;
int kSubCommandTable_PRAY_COUNT = 2;
int kSubIntegerRVTable_PRAY_COUNT = 11;
int kSubStringRVTable_PRAY_COUNT = 5;
int kSubCommandTable_NEW_COUNT = 4;
int kSubCommandTable_MESG_COUNT = 2;
int kSubCommandTable_STIM_COUNT = 4;
int kSubCommandTable_URGE_COUNT = 4;
int kSubCommandTable_SWAY_COUNT = 4;
int kSubCommandTable_ORDR_COUNT = 4;
int kSubCommandTable_GIDS_COUNT = 4;
int kSubCommandTable_PRT_COUNT = 8;
int kSubIntegerRVTable_PRT_COUNT = 3;
int kSubStringRVTable_PRT_COUNT = 1;
int kSubAgentRVTable_PRT_COUNT = 1;
int kSubCommandTable_PAT_COUNT = 8;
int kSubCommandTable_BRN_COUNT = 9;
int kSubCommandTable_DBG_COUNT = 13;
int kSubCommandTable_NET_COUNT = 13;
int kSubIntegerRVTable_NET_COUNT = 7;
int kSubStringRVTable_NET_COUNT = 6;
