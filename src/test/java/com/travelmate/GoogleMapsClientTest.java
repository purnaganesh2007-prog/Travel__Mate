package com.travelmate;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.travelmate.geo.GoogleMapsClient;
import com.travelmate.model.Place;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Parsing of Google Places API (New) responses into TravelMate places. */
public class GoogleMapsClientTest {

    private static final String MYSORE_PALACE = """
            {
              "id": "ChIJ-aH8Z8hwrzsRjZRLmDsPmPg",
              "displayName": { "text": "Mysore Palace", "languageCode": "en" },
              "formattedAddress": "Sayyaji Rao Rd, Agrahara, Chamrajpura, Mysuru, Karnataka 570001, India",
              "shortFormattedAddress": "Sayyaji Rao Rd, Agrahara, Mysuru",
              "location": { "latitude": 12.3051682, "longitude": 76.6551759 },
              "viewport": {
                "low": { "latitude": 12.3030, "longitude": 76.6530 },
                "high": { "latitude": 12.3070, "longitude": 76.6570 }
              },
              "types": ["historical_landmark", "tourist_attraction", "point_of_interest", "establishment"],
              "primaryType": "historical_landmark",
              "regularOpeningHours": { "weekdayDescriptions": [
                "Monday: 10:00 AM – 5:30 PM", "Tuesday: 10:00 AM – 5:30 PM", "Wednesday: 10:00 AM – 5:30 PM",
                "Thursday: 10:00 AM – 5:30 PM", "Friday: 10:00 AM – 5:30 PM", "Saturday: 10:00 AM – 5:30 PM",
                "Sunday: 10:00 AM – 5:30 PM" ] },
              "websiteUri": "https://www.mysorepalace.karnataka.gov.in/",
              "nationalPhoneNumber": "0821 242 1051",
              "googleMapsUri": "https://maps.google.com/?cid=17913476529430041741"
            }""";

    @Test
    void parsesAPlacesApiPlace() {
        JsonObject json = JsonParser.parseString(MYSORE_PALACE).getAsJsonObject();
        Place p = GoogleMapsClient.toPlace(json);

        assertEquals("google", p.source);
        assertEquals("Mysore Palace", p.name);
        assertEquals("google:ChIJ-aH8Z8hwrzsRjZRLmDsPmPg", p.placeRef);
        assertEquals(12.3051682, p.lat, 1e-9);
        assertEquals(76.6551759, p.lng, 1e-9);
        assertEquals("Sayyaji Rao Rd, Agrahara, Mysuru", p.address);
        assertEquals("Heritage", p.category);
        assertEquals("historical_landmark", p.osmType);
        assertEquals("Daily 10:00 AM – 5:30 PM", p.openingHours);
        assertEquals("https://www.mysorepalace.karnataka.gov.in/", p.website);
        assertEquals("0821 242 1051", p.phone);
        assertEquals("https://maps.google.com/?cid=17913476529430041741", p.mapsUrl);
        assertArrayEquals(new double[] { 12.3030, 12.3070, 76.6530, 76.6570 }, p.boundingBox, 1e-9);
    }

    @Test
    void placeWithoutLocationHasNoCoordinates() {
        Place p = GoogleMapsClient.toPlace(JsonParser.parseString(
                "{\"id\":\"abc12345\",\"displayName\":{\"text\":\"Somewhere\"}}").getAsJsonObject());
        assertEquals("Somewhere", p.name);
        assertNull(p.lat);
        assertNull(p.lng);
        assertEquals("Sightseeing", p.category);
    }

    @Test
    void mapsGoogleTypesToTravelMateCategories() {
        assertEquals("Food", GoogleMapsClient.categorize("south_indian_restaurant", List.of("restaurant", "food"))[0]);
        assertEquals("Religious", GoogleMapsClient.categorize("hindu_temple", List.of("place_of_worship"))[0]);
        assertEquals("Nature", GoogleMapsClient.categorize(null, List.of("botanical_garden", "park"))[0]);
        assertEquals("Culture", GoogleMapsClient.categorize("museum", List.of())[0]);
        assertEquals("Shopping", GoogleMapsClient.categorize(null, List.of("clothing_store"))[0]);
        assertEquals("Stay", GoogleMapsClient.categorize("hotel", List.of("lodging"))[0]);
        assertEquals("Transport", GoogleMapsClient.categorize(null, List.of("train_station"))[0]);
        assertEquals("Sightseeing", GoogleMapsClient.categorize(null, List.of("locality", "political"))[0]);
    }

    @Test
    void shortensOpeningHoursThatDifferByDay() {
        String hours = GoogleMapsClient.compactHours(List.of(
                "Monday: Closed", "Tuesday: 9:00 AM – 5:00 PM", "Wednesday: 9:00 AM – 5:00 PM",
                "Thursday: 9:00 AM – 5:00 PM", "Friday: 9:00 AM – 5:00 PM", "Saturday: 9:00 AM – 8:00 PM",
                "Sunday: 9:00 AM – 8:00 PM"));
        assertTrue(hours.startsWith("Mon Closed; Tue 9:00 AM – 5:00 PM;"), hours);
        assertTrue(hours.endsWith("Sun 9:00 AM – 8:00 PM"), hours);
    }

    @Test
    void rejectsMalformedPlaceIds() {
        GoogleMapsClient client = new GoogleMapsClient(null, "test-key");
        assertThrows(IllegalArgumentException.class, () -> client.details("../v1/other?x=1"));
        assertThrows(IllegalArgumentException.class, () -> client.details(""));
    }
}
