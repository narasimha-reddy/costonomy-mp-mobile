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

For the native builds the platform SDKs read their own keys, not this one:

```jsonc
// app.json
{
  "expo": {
    "ios":     { "config": { "googleMapsApiKey": "AIza..." } },
    "android": { "config": { "googleMaps": { "apiKey": "AIza..." } } }
  }
}
```

Use a **separate key per platform** with the matching application restriction
(bundle id / SHA-1). One key shared across web, iOS and Android can only be
restricted to the loosest of the three.

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
