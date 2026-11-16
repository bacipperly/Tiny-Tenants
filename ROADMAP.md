# Tiny Tenants Roadmap

Living backlog for where this is headed. Update this file as items are finished
or new ideas come up — it travels with the repo instead of living in a chat.

## Done
- [x] Grid-based walls, doors, windows, floors, furniture
- [x] Isometric camera with 90° rotation and the Sims-style wall cutaway
- [x] Drag-to-preview / commit-on-release for walls and floors
- [x] Wall paint tool (presets + custom color picker)
- [x] Keyboard shortcuts, scroll-wheel zoom
- [x] Wall tool: Line mode vs Room (rectangle) mode
- [x] Delete tool: single-click vs drag-delete toggle
- [x] Drag-size tooltip (shows WxH near the cursor while dragging)
- [x] A new game (no save yet) starts with the default house and household (src/persistence/defaultHouse.json, defaultHousehold.json), and the 📁 menu can start a new house from it
- [x] Pawns you send around (right-click → Go here), stopped by walls, windows,
  furniture and the lot line, and able to go through doors
- [x] Live mode, separate from the build and furnish controls
- [x] Delete tool defaults to erasing an area
- [x] Two-sided wall paint, painting anywhere on a wall
- [x] Paint bucket and eyedropper for walls and floors, flood fill for floors
- [x] Drag to place windows, three window sizes
- [x] Door styles: wood, glass, French, sliding, barn and saloon doors that open as a pawn comes through (swinging away from them or sliding aside) and close behind them, plus an archway and a plain doorway
- [x] Automatic flat roofs, dark rooms, daylight and sun through windows
- [x] Idle pawns that breathe, look around and stroll near where they were sent
- [x] Pawns that go and use furniture by themselves, then get up when they're done
- [x] Personalities (shy, easygoing, outgoing): outgoing pawns gather and chat, shy
  ones slip away to somewhere quiet
- [x] Needs that run down, furniture that advertises what it offers, and choices
  weighted by personality
- [x] Playful/mellow/grouchy and neat/normal/sloppy traits, idle gestures in
  character, moods, and friends and rivals from how chats go
- [x] Furniture with its own shapes for every piece, plus a Decor tab
- [x] Rugs lie flat: pawns walk over them and other furniture can stand on them
- [x] Lamps and fireplaces glow, so they stay bright in a dark room, and windows aren't the only light
- [x] Lamps and fireplaces give off real light: a pool on the floor that stops at the walls, a halo, and firelight that flickers
- [x] Lamps near each other share their light, so a cluster is a bit brighter than one lamp instead of blowing out
- [x] Cat and dog paintings: a cat portrait, a dog portrait and a wide one of the two of them on a sofa
- [x] A Wall Art tab: small, landscape, tall and wide paintings, a photo collage, three panels, an abstract, a poster, a pinboard and a wall clock that tells the real time. They hang on the wall the cursor points at, turn to face out, leave the floor free, and hide when their wall is cut down
- [x] A Tabletop tab of small things (lamps, candles, bowls, plants, a coffee maker, microwave, laptop, globe, cake and more) set on tables, counters, dressers, nightstands, desks and the bookshelf; they move, turn and get deleted with what they're on
- [x] Esc puts down the piece you're holding to place
- [x] A search box at the top of Build and Furnish that finds furniture in any tab and Build's tools, remembers what you typed, and opens with /
- [x] Furniture can't be placed or turned across a wall, door or window; R skips to the next way it fits
- [x] The fireplace has to be lit: its pie menu sends a pawn to light it, put it out, or warm up by it. It gives no light or warmth while it's out
- [x] Pie menus in Live: clicking the ground (Go here), furniture, a mess, another pawn or your own pawn opens a ring of what you can do; no click acts on its own, with sub-rings (Watch TV…, Read…, Talk…), More… past eight choices, and greyed-out choices that say why
- [x] Social interactions you choose: chat, tell a joke, compliment, gossip, hug, argue and wave, which go well or badly by personality and how the two get along; and gestures for your own pawn
- [x] A Move (hand) tool, H: pick a piece up, turn it with R, put it down elsewhere; Esc puts it back, Delete throws it away
- [x] Click a pawn while building or furnishing to see its status; a Statuses toggle keeps it up outside Live
- [x] Pawns hidden behind a wall or furniture can't be clicked through it, so a click there reaches what you can see
- [x] An Outdoor tab: oak, pine, birch and apple trees, bushes, a hedge, a flower bed, raised and in-ground gardens, a pond, a bird bath, a gnome and a garden lamp
- [x] Fish swim and bubbles rise in the fish tank; the fireplace's flames flicker
- [x] A gerbil cage on a pedestal: the gerbil runs laps, then runs in its wheel, which turns only while it's in there
- [x] A parrot cage on a stand: the parrot shuffles along its perch, flaps, and looks around
- [x] A lizard tank: the lizard basks under its lamp with a few push-ups, darts to its water dish, stares out the front glass, and flicks its tongue
- [x] A small gecko tank: two geckos climb up and across the glass, cling there, and come back down to the floor
- [x] The fish tank has swaying plants and a treasure chest that opens to let out bubbles
- [x] The fish tank has a dim light bar across the top, and the bookshelf is packed with individual books, with gaps and a flat stack on each shelf
- [x] Pawns do something different at each object: admire statues, peer into tanks and cages, warm up by the fire, scrub at sinks, rummage in the fridge, stir, chop, type, play, watch, browse, primp, line up a shot
- [x] Objects react while in use: the fridge door opens on a lit inside, burners glow, screens come on, taps run
- [x] Showers rain down on whoever's in them, and baths fill around the pawn with ripples and suds
- [x] After eating, pawns wash their plate at a sink
- [x] A chair in front of something pawns use standing, like a desk chair at a computer, isn't in the way: they sit in it, face the piece and use it from there, then slide back out
- [x] The big bed sleeps two, side by side; pawns slide off beds and sofas the way they got on, so a bed wedged between a wall and nightstands can't trap them, and anyone left standing inside furniture steps out
- [x] A pawn you send to bed or to sit gets up once it's had what it came for (after at least 20 seconds), and one sent to a full bed shrugs instead of wandering behind the headboard
- [x] Pieces with a front are only used from it (fridge, stove, sinks, counters, TV, sofa, toilet, shower and more), and beds never over the headboard
- [x] Delete, Undo and Redo in their own panel beside the mode tabs; Furnish mode is just the palette, with no Furniture or Rotate buttons
- [x] Counters, counter sinks, the stove and the dishwasher join into one run, with corner pieces where two runs meet
- [x] A dishwasher: pawns load dirty plates into it, quicker than washing up at a sink, and its door drops open while they do
- [x] Meals: pawns make a plate at the fridge, stove or counter, carry it to a
  table, set it down and eat
- [x] Messes: showers and baths leave puddles, cooking leaves scraps, pawns track mud in from the yard (a rug at the door wipes their feet), and plates get left where they were eaten. Old trash and dishes draw flies; puddles dry up on their own
- [x] An Environment need that comes from the room: decor makes it nicer and mess makes it worse, much more so for neat pawns. Neat pawns clean up eagerly (and resent cleaning up after others), normal ones when it bothers them, sloppy ones almost never. Click a mess in Live to send the selected pawn to clean it
- [x] A trash can in the Kitchen tab: trash goes in it, and dirty plates go to a sink
- [x] Furniture tabs by kind rather than room: Seating, Tables, Beds, Storage, Kitchen, Bathroom, Lighting, Electronics, Hobbies, Kids, Pets, Plants, Decor, Wall Art, Outdoor
- [x] Ceiling lights (pendant, chandelier, flush light, ceiling fan) that hang indoors and leave the floor free
- [x] A small bookshelf, chest of drawers, long dresser, vanity, small wardrobe, armoire, clothes rack, coat rack and wall coat hooks
- [x] A pantry in the kitchen for snacks, a side table and a key table
- [x] Kids' toys: toy box, rocking horse, building blocks, dollhouse, a train set whose train goes round, and a teddy bear
- [x] The desk and computer are separate: the computer goes on any desk or table, and older saves keep their computers
- [x] Privacy: pawns stay out of a bathroom while someone's on the toilet or in the shower or bath, and walking in on them causes a scene that hurts how they get along
- [x] Performance: rebuilds free the old shapes from the graphics card (they used to pile up), each piece of furniture, each wall and the whole floor draw in one go (about 2,500 draws a frame down to about 530), and only the furniture that changed is rebuilt
- [x] Saving says so: "💾 Saved" beside the folder button, or what went wrong if the browser wouldn't keep it. The house also saves on its own about 20 seconds after a change, and when the page is closed, hidden or reloaded. The 📁 menu says when it was last saved
- [x] Several houses: the 📁 menu lists your saved houses to switch between, rename or delete (a second click confirms), and starts a new one from an empty plot, the default house, or a copy of the one you're in. Leaving a house saves it first, and the one house saved before this became "My house"
- [x] Up to three floors: ⬆ / ⬇ in the view panel (or Page Up / Page Down) change floors, and going above the top starts a new one. Floors above the one you're on hide; floors below show in full. Upstairs, tiles go over the floor below, walls stand on it, and furniture needs floor under it. 🪜 Stairs in Build climb to the next floor and leave a stairwell in it. Each floor gets a roof where nothing covers it
- [x] Five kinds of stairs, picked in Build's 🪜 Stairs tool: straight (1×3), L-shaped round a landing, its corner left free (2×2), U-shaped up, round and back (2×3), spiral round a pole (2×2) and a steep ship ladder (1×1). Pawns hop up and down each step, a little slower than they walk
- [x] Fences and railings: a 🪵 Fence tool in Build (key 0), dragged along grid lines like walls in Line or Room mode. Picket, ranch, privacy and stone fences, and wood, iron and glass railings. Gate turns a length into a gate that swings open for pawns. Auto-railings go round every open upstairs edge and stairwell, leaving the top of the stairs open, in the railing style last picked, and can be turned off. Fences block pawns, never make rooms, and delete, undo and save like walls
- [x] Paths view: 👣 Paths in the 👁️‍🗨️ special views draws every walking pawn's route as a trail of dots in its color, flowing toward a ring where it's headed, over walls and furniture, on the floors being shown
- [x] Floor supports: upstairs tiles go over rooms below, up to 2 squares past a wall or pillar below, and round the top of stairs; a floor on the floor below no longer holds anything up. Deleting a wall or pillar that holds tiles up is refused and those tiles flash; tiles laid before the rule stay
- [x] 🏛️ Pillar tool: wood post, column, stone or steel on a grid corner, holding up 2 squares round it; pawns can't cut diagonally through one
- [x] Stairs lay their own landing tile on the floor above, and take it with them when moved or deleted
- [x] Railings per tile: each upstairs tile keeps the railing picked in the Fence tool when it was laid, so changing the style never restyles what's built
- [x] Floor surfaces: plain, planks, herringbone parquet, tile, checker, flagstone, carpet and basketweave pavers, picked in the Floor tool; dragging over tiles changes them; Paint tints them
- [x] Roof coverings, in the Roof tool: slate, asphalt, clay tile, wood shakes, standing-seam metal or thatch on pitched roofs; gravel, membrane or a green roof on flat ones
- [x] Painted gable ends: each strip takes the outside color of the wall below it, or its own color painted with the Paint tool (walls, with the roof on); painting it the wall's color goes back to following the wall
- [x] A starter house that new games open in: a little furnished home with a living room and kitchen, a bedroom with a double bed, a bathroom with bath and shower, a front path and a garden; the old default is still in the 📁 menu as the Garden lot
- [x] A snake terrarium (Pets): a wooden vivarium with a glass front, a heat lamp, a hide, a branch and a water bowl, and a corn snake that slithers round it in S-bends, rests now and then, and flicks its tongue
- [x] Bedding colors, picked in Furnish: right-click a bed's tile for a wheel of ten colors round its own; beds are placed in the picked color; every colorable tile has a paint drop in its corner showing the color it goes down in, white until another is picked (the middle of the wheel is its own color); saved, and undoable
- [x] The color wheel for seating and rugs too: the fabric of the sofa, armchair, sectional, booth seat and desk chair, and rugs and long rugs (the middle, with the border a shade darker); wooden chairs, stools and benches keep their wood
- [x] Turn as you place: press on a tile and the piece waits there with a circle and an arrow round it; drag away and it turns to face the cursor, snapping to the four sides; let go to put it down. A quick click places it as before, and the next piece starts turned the same way
- [x] Pieces are placed by their anchor, the middle of their back (a bed's headboard, a sofa's back): it goes on the square you point at, and the piece turns about it, with the turning circle centered there. The Move tool too: a piece in hand follows the cursor by its anchor and turns about it, and putting it down works like placing, with hold and drag to turn
- [x] Mode controls (the 👁️‍🗨️ menu, once Special views) has Select everything: the Delete tool then takes dirt, trash, puddles and dirty plates too, by click or by dragging an area
- [x] Pools and spas: a Pool tool in Build (Outside) digs any shape by dragging, with Ctrl-drag to fill back in, so a horseshoe is two drags; spas are shallow with a bench round the inside and bubbles. The grass opens over them, with a stone rim (coping), tiled walls and floor, and see-through shimmering water; where a pool and a spa touch, a coping divider runs between them. Pool items from the tool's Items row: a ladder, pool stairs and a diving board, which only go where they fit the pool
- [x] Swimming: pawns jump in off the edge with a splash, dive off the board, climb down the ladder or walk down the stairs, swim laps round the pool's corners, and climb out by the nearest stairs or ladder, or over the edge; they soak on a spa's bench and sit on the edge with their feet in. They go on their own for fun, or from the Live right-click menu on the water, the edge, the board, a ladder or the stairs. Sent somewhere dry while in the water, a pawn swims to the way out nearest where it's going, climbs out, and walks on. From the Live menu, a swimmer can be sent out a particular way: Climb out by a ladder, Walk out by the stairs, or Climb out here onto a square on the edge. Any edge of a pool or spa works as a way in or out: right-click a square beside the water for Get in here (or Soak here at a spa), and while swimming or soaking, right-click the edge or the water beside it for Climb out here. Every splash has a ring of foam spreading on the water; a dive off the board makes a much bigger one, with a tall column of spray and a wide crown
- [x] Placing small things on a table, counter or shelf shows how high they'll sit: a dashed line down to the floor, a shadow on the floor, a ring on the top, and a label saying what it's on and how high
- [x] More beds: a canopy bed with drapes, a daybed, a low futon, a hammock on a stand, a race car bed, a camp bed, a round bed and a bunk bed (two sleepers stacked on one square, with a ladder and a guard rail up top); all take bedding colors
- [x] The hammock sways gently from its ropes while someone lies in it, and they sway with it
- [x] Sinks with real basins: the bathroom sink's bowl is sunk into its top with a drain, and the kitchen sink is a steel-lined bowl sunk through the counter, with the water running all the way down
- [x] Buttons keep their dark icons when the page is shown in dark mode, as the shared page can be
- [x] New furniture: a sectional sofa and diner booth seats that run together and turn corners like counters, with pawns sliding along the run to reach an inner seat (never past someone sitting); a chess table, a telescope, a bug cage with blinking fireflies, a monstera and an espalier pear on wires
- [x] Pawns on every floor: they climb the stairs one at a time, rising smoothly up the steps, and choose beds, seats, company and chores on any floor, counting the walk up. Upstairs they keep to the tiles, never the stairwell. Pawns and messes above the floor you're viewing are hidden, double-clicking a pawn in the pawn bar goes to its floor, and a pawn whose floor is deleted drops to the one below
- [x] Pitched roofs: a 🏠 Roof tool in Build picks flat, hip or gable for the whole house. Hip and gable roofs follow any shape (L-shapes get valleys). Gables give each wing of an L, T or U its own ridge, running out from the main block, and wall in their ends. Pitched roofs have eaves, and each slope is shaded by which way it faces. Pitched roofs are shingled, in rows that run level along each slope; flat roofs have a gravel finish. Saved with the house and undoable
- [x] A start screen the game opens on, titled Tiny Tenants, with the house you were in turning slowly behind it: Continue (or Move in the first time), a new Starter house, Garden lot or Empty lot, and your other saved houses. Enter plays, and the 📁 menu has a way back to it. The game is also published on GitHub Pages
- [x] Each house has its own household: its own people, how they get along, and the mess they leave. Switching houses leaves the last one as it was. A Starter house or Empty lot starts with a couple, the Garden lot with the big household, and a copy brings everyone along. A house saved before this keeps the people it had. The start screen and 📁 menu show how many people live in each house

## Next
- More speed if needed: merge walls further, rebuild walls and floors only where they changed
- Eyedropper for furniture: click a placed piece to pick up that kind to place again
- Floor textures to paint with (wood, tile, carpet, stone) and patterns, not just colors

## Later
- Each house with its own household, rather than the same pawns in every house
- Day and night: the sun moves, evenings get dark so lamps matter, and pawns go to bed at night (they already sleep in beds when they're tired)
- Roof per area rather than one style for the whole house, a choice of pitch and roof color or material
- Pawn polish: a walk animation, and a silhouette when a pawn is behind a wall
- Half walls (waist-high, can hold a countertop, don't split a room) and hedges that grow in over a few days
- Fence polish: painting fences, changing a fence's style by clicking it, and removing a single auto-railing
- Pawns passing each other on the stairs rather than waiting their turn, and stair materials (stone, painted, carpet runner)
- Free 3D perspective camera (the camera module was built to make this an
  isolated swap, not a rewrite)
- Live-mode wall fade: walls near the walking pawn fade instead of the hard
  per-rotation cutaway. Walls now share one material to draw faster, so a
  faded wall would get its own see-through copy
