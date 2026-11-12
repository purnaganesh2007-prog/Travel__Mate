package com.travelmate.model;

/** A real place looked up on Google Maps (or OpenStreetMap when no Google key is configured). */
public class Place {
    public boolean success = true;
    /** "google" or "osm". */
    public String source = "osm";
    /** Link that opens this place in Google Maps (the app, on a phone). Google places only. */
    public String mapsUrl;
    public String name;
    public String displayName;
    /** TravelMate category (Heritage, Food, Nature, ...). */
    public String category;
    public String categoryIcon;
    /** Raw provider type: Google primary type ("tourist_attraction") or OSM class/type ("historic/castle"). */
    public String osmType;
    public String address;
    public Double lat;
    public Double lng;
    /** e.g. "google:ChIJ…" or "osm:way/656323590". */
    public String placeRef;
    public String osmKind;
    public String osmId;
    /** [minLat, maxLat, minLng, maxLng] bounding box. */
    public double[] boundingBox;
    public String openingHours;
    public String website;
    public String phone;
}
