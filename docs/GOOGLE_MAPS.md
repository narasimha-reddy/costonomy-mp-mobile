# Google Maps

The map picker is live code with no mock behind it: it talks to Google or it
shows "Map not configured". That was a deliberate choice — every other provider
here (payments, OTP, storage, delivery) has a mock, and this one does not.

## What to create

One **browser key** in Google Cloud, with:

- **Maps JavaScript API** — the tiles
- **Places API (New)** — address search
- **Geocoding API** — reading an address back from a dropped pin

Then restrict it, because a browser key is readable by anyone who opens the page.
The restriction is what makes it safe, not the fact that it sits in an env file:

- **Application restrictions** → HTTP referrers, listing your own origins
  (`http://localhost:7071/*` for development, plus your deployed host)
- **API restrictions** → only the three APIs above

Billing must be enabled on the project. Without it the SDK loads and then refuses
to draw, which looks like a code fault and is not one.

## Where it goes

```
# .env  (not committed)
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
```

Expo reads `EXPO_PUBLIC_*` at **build time**, so the dev server must be restarted
after changing it. A running server will not pick it up.

For the Android build, `app.config.js` (next to `app.json`) copies that same
`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` into `android.config.googleMaps.apiKey` at build
time, which becomes `com.google.android.geo.API_KEY` in the manifest. Nothing is
committed; with the variable empty the config is left as `app.json` has it. Set the
variable in the environment of the EAS/Gradle build, not only in a local `.env`.

The Android key needs the **Maps SDK for Android** enabled, and should be restricted
to package `com.costonomy.mp` plus the signing certificate's SHA-1 (the upload key
and, for Play App Signing, the Play-signed key). iOS is not wired: there the native
map also falls back to the schematic until a key is added under
`ios.config.googleMapsApiKey`.

**Without a key**, the delivery tracking screen draws the schematic map (streets,
route, outlet, driver dot; not to scale) instead of a blank Google map. The same
sketch is the web build. Because one variable now feeds web and Android, either use
one key restricted to both (the loosest of the two) or build Android with its own
value of the variable.

Any key used for server-side geocoding stays out of all of this and is never
shipped to a client.

## What the store owner sees

Nothing about any of this. With no key the panel says "Map unavailable" and that
the place can still be pinned another way — the setting's name and the API names
go to the browser console, where a developer is looking, and to this file.

Printing our own configuration into the product is meaningless to the person
holding the phone and is a small thing to hand a stranger.

## What was verified without a key

- the loader builds the script tag and `google.maps` initialises
- the picker mounts: search host, map container, marker and listeners construct
- with a deliberately invalid key the console says `InvalidKeyMapError`, which is
  Google refusing the key rather than our code failing

**Not verified:** tiles rendering, search returning results, reverse geocoding,
and the whole native path. Those need a real key and, for native, a device build.

## Two API notes that cost time

`google.maps.places.Autocomplete` is **not available to new customers** as of
1 March 2025. A key created today cannot use it, and it fails quietly. The web
picker uses `PlaceAutocompleteElement`, which is the supported replacement and is
a web component that brings its own input.

The loader deliberately does **not** pass `loading=async`. That bootstrap resolves
with a stub where `google.maps.Map` does not exist until `importLibrary` has been
awaited, so `new google.maps.Map(...)` throws *"is not a constructor"* — a failure
that reads exactly like a bad key and is not one.

`google.maps.Marker` is deprecated in favour of `AdvancedMarkerElement`, which
requires a Map ID configured in Cloud. The classic marker still works and is not
scheduled for removal, so it stays until a Map ID is worth the extra setup.

## The web delivery map (rider tracking)

The restaurant and supplier web apps draw the tracking map with the Maps JavaScript API
(`components/delivery/GoogleTrackMap.web.tsx`): supplier pin, restaurant pin, the truck and the route legs.
Without a key, or if Google refuses it (`gm_authFailure`) or draws no tiles within 6 s, they show the schematic.

1. Google Cloud Console -> enable **Maps JavaScript API** on the project (billing on).
2. Credentials -> create an API key, restrict it to the Maps JavaScript API and to HTTP referrers
   `http://localhost:7074/*` plus the LAN URL you open the app on (for example `http://192.168.1.20:7074/*`).
3. Put `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY=...` in `~/.costonomy-maps.env` (never commit it or paste it in a chat).
   If that name is empty the build falls back to `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, only when that is set.
4. Re-export the web build (the variable is inlined at build time).

## Map label language (web delivery map)

The loader puts `language=en&region=IN` on the bootstrap script URL (`lib/maps/googleWebLoader.ts`, asserted in
`tests/googleWebLoader.test.ts`). Google still draws some place names in their local script (Kannada) on the base map
tiles, because those labels come from the map data, not from the API language. A map style in code cannot hide only the
non-English labels. The fix is a Cloud-based map style attached to a Map ID, with the language set to English only
(Google Cloud console, Map Management, Map Styles); then pass that `mapId` when the map is created. Until a Map ID
exists, mixed labels are expected.
