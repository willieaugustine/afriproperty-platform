const axios = require('axios');

async function getLocationFromIP(ip) {
  try {
    const response = await axios.get(
      `http://api.ipstack.com/${ip}?access_key=${process.env.IPSTACK_API_KEY}`
    );

    return {
      country: response.data.country_code,
      country_name: response.data.country_name,
      city: response.data.city,
      latitude: response.data.latitude,
      longitude: response.data.longitude,
      location: `POINT(${response.data.longitude} ${response.data.latitude})`
    };
  } catch (error) {
    console.error('Geolocation error:', error);
    return null;
  }
}

async function geocodeAddress(address) {
  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/geocode/json',
      {
        params: {
          address,
          key: process.env.GOOGLE_MAPS_API_KEY
        }
      }
    );

    if (response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      return {
        latitude: location.lat,
        longitude: location.lng,
        formatted_address: response.data.results[0].formatted_address,
        location: `POINT(${location.lng} ${location.lat})`
      };
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

module.exports = {
  getLocationFromIP,
  geocodeAddress
};
