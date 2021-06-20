const defaultData = {
  format: "png",
  scale: "1",
  width: 800,
  height: 600,

  type: "center",
  lat: 47.379,
  lon: 8.5375,
  zoom: 17,
  bearing: 0,
  pitch: 0,
  raw: false,

  miny: 47.369,
  maxy: 47.389,
  minx: 8.5275,
  maxx: 8.5475,

  z: 11,
  x: 1072,
  y: 717,

  markers: [
    {
      type: "color",
      color: "#FF0000",
      size: 'l',
      lat: 47.379,
      lon: 8.536
    },
    {
      type: "url",
      url: "https://ssl.gstatic.com/gb/images/a/99be7c5086.png",
      lat: 47.378,
      lon: 8.544
    }
  ]
};

const styleMatch = document.location.pathname.match(/\/styles\/(.*?)\//);
const style = styleMatch ? styleMatch[1] : 'none';

function formSerialize(form) {
  const data = new FormData(form);
  const markers = extractMarkersFromFormData(data);
  return { markers, ...Object.fromEntries(data) };
}

function formDeserialize(form, data) {
  for(const [key, val] of Object.entries(data)) {
    const input = form.elements[key];
    if (input) {
      switch(input.type) {
        case 'checkbox': input.checked = !!val; break;
        default:         input.value = val;     break;
      }
    }
  }
}

function extractMarkersFromFormData(data) {
  return data.getAll("marker-type[]").map((type, i) => {
    const marker = { type };

    if (type === "color") {
      marker.color = data.getAll("marker-color[]")[i];
      marker.size = data.getAll("marker-size[]")[i];
    } else if (type === "url") {
      marker.url = data.getAll("marker-url[]")[i];
    }

    marker.lat = data.getAll("marker-lat[]")[i];
    marker.lon = data.getAll("marker-lon[]")[i];

    return marker;
  });
}

const form = document.querySelector("form");

form.addEventListener('change', (e) => {
  e.preventDefault();
  update();
});

function update(data=formSerialize(form)) {
  updatePreview(data);
  updateForm(data);
}

const addMarkerButton = document.querySelector(".add-marker");
addMarkerButton.addEventListener('click', (e) => {
  e.preventDefault();

  addMarker();
});


// Toggling 'raw' checkbox will convert between mercator and lat/lon
document.querySelector("form input[name='raw']").addEventListener('click', (e) => {
  const checked = e.target.checked;

  const latElement = document.querySelector("form input[name='lat']");
  const lonElement = document.querySelector("form input[name='lon']");

  translateCoords(checked, 'lon', 'lat');
  translateCoords(checked, 'minx', 'miny');
  translateCoords(checked, 'maxx', 'maxy');
  translateCoords(checked, 'marker-lon[]', 'marker-lat[]');
});

function translateCoords(toMercator, fieldX, fieldY) {
  const xElements = document.querySelectorAll(`.field input[name='${fieldX}']`);
  const yElements = document.querySelectorAll(`.field input[name='${fieldY}']`);

  const xLabels = document.querySelectorAll(`.field label[for='${fieldX}']`)
  const yLabels = document.querySelectorAll(`.field label[for='${fieldY}']`);

  const labelX = ['X', 'Longitude'];
  const labelY = ['Y', 'Latitude'];

  const fn = toMercator ? inverseMercator : forwardMercator;

  for (let i = 0; i < xElements.length; i++) {
    const xElement = xElements[i];
    const yElement = yElements[i]
    const xLabel = xLabels[i];
    const yLabel = yLabels[i];

    const [x, y] = fn(parseFloat(xElement.value), parseFloat(yElement.value));

    xElement.value = toMercator ? Math.round(x) : x.toFixed(4);
    yElement.value = toMercator ? Math.round(y) : y.toFixed(4);

    if (xLabel && yLabel) {
      // innerHTML so as not to pick up text-transform
      xLabel.innerText = xLabel.innerHTML.replace(...(toMercator ? labelX.reverse() : labelX));
      yLabel.innerText = yLabel.innerHTML.replace(...(toMercator ? labelY.reverse() : labelY));
    }
  }
}

function updateForm(data) {
  formDeserialize(form, data);

  hideFormSections(data);

  const markerList = document.querySelector(".marker-list");
  markerList.innerHTML = "";

  for (let markerData of data.markers) {
    const el = makeMarkerInput(markerData);
    markerList.appendChild(el);
  }
}

function hideFormSections(data) {
  if (data.type === "center") {
    document.querySelector("form .center").style.display = "block";
    document.querySelector("form .bounds").style.display = "none";
    document.querySelector("form .tile").style.display = "none";
    document.querySelector("form .markers").style.display = "none";
  }

  if (data.type === "bounds") {
    document.querySelector("form .center").style.display = "none";
    document.querySelector("form .bounds").style.display = "block";
    document.querySelector("form .tile").style.display = "none";
    document.querySelector("form .markers").style.display = "none";
  }

  if (data.type === "tile") {
    document.querySelector("form .center").style.display = "none";
    document.querySelector("form .bounds").style.display = "none";
    document.querySelector("form .tile").style.display = "block";
    document.querySelector("form .markers").style.display = "none";
  }

  if (data.type === "markers") {
    document.querySelector("form .center").style.display = "none";
    document.querySelector("form .bounds").style.display = "none";
    document.querySelector("form .markers").style.display = "block";
  }
}

function addMarker() {
  const data = formSerialize(form);
  const lastMarker = data.markers[data.markers.length - 1] || defaultData.markers[0];

  data.markers.push(Object.assign({}, lastMarker));
  update(data);
}

function makeMarkerInput(markerData) {
  const template = document.querySelector(".marker-template").cloneNode(true);
  template.classList.remove("marker-template");

  template.querySelector(".marker-type").value = markerData.type;

  if (markerData.type === "color") {
    template.querySelector(".marker-color").value = markerData.color;
    template.querySelector(".marker-size").value = markerData.size;
    template.querySelector(".url-field").style.display = "none";
  } else {
    template.querySelector(".marker-url").value = markerData.url;
    template.querySelector(".color-field").style.display = "none";
    template.querySelector(".size-field").style.display = "none";
  }

  template.querySelector(".marker-lat").value = markerData.lat;
  template.querySelector(".marker-lon").value = markerData.lon;

  template.querySelector(".close").addEventListener('click', removeMarker);

  return template;
}

function removeMarker(e) {
  e.preventDefault();

  const parent = e.target.parentNode.parentNode;
  parent.remove();
  update();
}

function createImageUrl(data) {
  const scale = data.scale > 1 ? `@${data.scale}x` : '';
  const end = [scale, data.format].join('.');
  const filename = `${data.width}x${data.height}${end}`;

  const raw = data.raw ? "/raw" : "";

  if (data.type === "center") {
    let coords = `${data.lon},${data.lat},${data.zoom}`;
    if (data.bearing || data.pitch) {
      coords += `@${data.bearing},${data.pitch}`;
    }
    return `/styles/${style}/static${raw}/${coords}/${filename}`;
  } else if (data.type === "bounds") {
    const bounds = [data.minx, data.miny, data.maxx, data.maxy].join(',');
    return `/styles/${style}/static${raw}/${bounds}/${filename}`;
  } else if (data.type === "tile") {
    return `/styles/${style}/${data.z}/${data.x}/${data.y}${end}`;
  } else if (data.type === "markers") {
    const markerString = makeMarkerUrl(data.markers);
    return `/styles/${style}/static${raw}/${markerString}/auto/${filename}`;
  }
}

function makeMarkerUrl(markers) {
  const seen = {};
  return markers.map(marker => {
    const coords = [marker.lon, marker.lat].join(',')
    if (marker.type === "color") {
      return `pin-${marker.size}+${marker.color.replace(/[^A-Fa-f0-9]/g, '')}(${coords})`;
    } else if (marker.type === "url") {
      const markerUrl = encodeURIComponent(marker.url);

      if (seen[markerUrl]) {
        return `ref-${seen[markerUrl]}(${coords})`;
      } else {
        const ref = Object.keys(seen).length + 1;
        seen[markerUrl] = ref
        return `url-${markerUrl}(${coords}):${ref}`;
      }
    }
  }).join(",");
}

function inverseMercator(lon,lat) {
  const x = lon * 20037508.34 / 180;
  const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180)  * 20037508.34 / 180;

  return [x, y]
}

function forwardMercator(x, y) {
  const lon = x *  180 / 20037508.34 ;
  //thanks magichim @ github for the correction
  const lat = Math.atan(Math.exp(y * Math.PI / 20037508.34)) * 360 / Math.PI - 90;
  return [lon, lat]
}

function updatePreview(data) {
  const imageUrl = createImageUrl(data);

  const img = document.querySelector('.preview img');
  img.src = ""; // clear existing to make it obvious image is reloading
  img.src = 'http://localhost:5050' + imageUrl;

  if (data.type === "tile") {
    img.setAttribute("width", null);
    img.setAttribute("height", null);
  } else {
    img.width = data.width;
    img.height = data.height;
  }

  document.querySelector(".url .value").innerText = imageUrl;
}

update(defaultData);
