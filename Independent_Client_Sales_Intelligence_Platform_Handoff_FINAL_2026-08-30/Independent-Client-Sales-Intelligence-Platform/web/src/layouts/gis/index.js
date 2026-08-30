/* eslint-disable react/prop-types */
import { Component, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import MapGL, { Layer, Popup, Source } from "react-map-gl/maplibre";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDBadge from "components/MDBadge";
import PageState from "components/Platform/PageState";
import SectionHeader from "components/Platform/SectionHeader";
import useAsyncData from "hooks/useAsyncData";
import useSessionState from "hooks/useSessionState";
import { getGisLeads } from "services/api";
import { number, safeUrl } from "lib/format";

const clusterLayer = {
  id: "clusters",
  type: "circle",
  source: "leads",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": ["step", ["get", "point_count"], "#49a3f1", 50, "#1A73E8", 200, "#344767"],
    "circle-radius": ["step", ["get", "point_count"], 18, 50, 24, 200, 30],
    "circle-opacity": 0.88,
  },
};

const clusterCountLayer = {
  id: "cluster-count",
  type: "symbol",
  source: "leads",
  filter: ["has", "point_count"],
  layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
  paint: { "text-color": "#ffffff" },
};

const pointLayer = {
  id: "unclustered-point",
  type: "circle",
  source: "leads",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": ["case", [">=", ["to-number", ["get", "b2b_score"]], 75], "#4CAF50", "#1A73E8"],
    "circle-radius": 7,
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
  },
};

function normalizedKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function consolidateCompanyLocations(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const latitude = Number(row?.latitude);
    const longitude = Number(row?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;

    const nameKey = normalizedKey(row?.name) || String(row?.lead_id || "");
    const countryKey = normalizedKey(row?.country);
    const cityKey = normalizedKey(row?.city);
    const coordinateKey = `${latitude.toFixed(4)}|${longitude.toFixed(4)}`;
    const key = `${nameKey}|${countryKey}|${cityKey}|${coordinateKey}`;
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, {
        ...row,
        latitude,
        longitude,
        contact_count: 1,
        source_lead_ids: [row?.lead_id].filter(Boolean),
        contact_emails: [row?.email].filter(Boolean),
      });
      return;
    }

    current.contact_count += 1;
    if (row?.lead_id && !current.source_lead_ids.includes(row.lead_id)) {
      current.source_lead_ids.push(row.lead_id);
    }
    if (row?.email && !current.contact_emails.includes(row.email)) {
      current.contact_emails.push(row.email);
    }

    if (Number(row?.b2b_score || 0) > Number(current?.b2b_score || 0)) {
      const preserved = {
        contact_count: current.contact_count,
        source_lead_ids: current.source_lead_ids,
        contact_emails: current.contact_emails,
      };
      Object.assign(current, row, preserved, { latitude, longitude });
    }
  });

  return [...grouped.values()];
}

class MapRenderBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // Keep GIS usable even if WebGL/maplibre fails on a specific browser/GPU.
    // eslint-disable-next-line no-console
    console.error("GIS map renderer failed; switching to safe geographic fallback.", error);
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function GeographicFallback({ rows, onSelect }) {
  const plotted = rows.slice(0, 1800);
  return (
    <Box
      sx={{
        height: "650px",
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(180deg, #F8FBFF 0%, #F4F7FB 100%)",
        borderTop: "1px solid #E9EEF5",
      }}
    >
      <svg
        viewBox="0 0 1000 500"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        role="img"
        aria-label="Geographic lead plot"
      >
        {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((x) => (
          <line key={`x-${x}`} x1={x} y1="0" x2={x} y2="500" stroke="#E5EBF3" strokeWidth="1" />
        ))}
        {[100, 200, 300, 400].map((y) => (
          <line key={`y-${y}`} x1="0" y1={y} x2="1000" y2={y} stroke="#E5EBF3" strokeWidth="1" />
        ))}
        {plotted.map((row, index) => {
          const x = ((Number(row.longitude) + 180) / 360) * 1000;
          const y = ((90 - Number(row.latitude)) / 180) * 500;
          const high = Number(row.b2b_score || 0) >= 75;
          const radius = Math.min(8, 3 + Math.log2(Math.max(1, Number(row.contact_count || 1))));
          return (
            <circle
              key={`${row.lead_id || row.name}-${index}`}
              cx={x}
              cy={y}
              r={radius}
              fill={high ? "#4CAF50" : "#1A73E8"}
              fillOpacity="0.72"
              stroke="#FFFFFF"
              strokeWidth="1.2"
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(row)}
            />
          );
        })}
      </svg>
      <Box
        sx={{
          position: "absolute",
          left: 16,
          bottom: 14,
          px: 1.2,
          py: 0.8,
          borderRadius: "9px",
          backgroundColor: "rgba(255,255,255,0.92)",
          border: "1px solid #E6EBF3",
        }}
      >
        <MDTypography variant="caption" color="text">
          Safe geographic fallback · {number(plotted.length)} company locations plotted
        </MDTypography>
      </Box>
    </Box>
  );
}

export default function GIS() {
  const state = useAsyncData(getGisLeads, []);
  const [country, setCountry] = useSessionState("platform-gis:country", "all");
  const [status, setStatus] = useSessionState("platform-gis:status", "all");
  const [minimumScore, setMinimumScore] = useSessionState("platform-gis:minimum-score", 0);
  const [selected, setSelected] = useState(null);
  const [mapFailed, setMapFailed] = useState(false);

  const rawRows = Array.isArray(state.data) ? state.data : [];
  const rows = useMemo(() => consolidateCompanyLocations(rawRows), [rawRows]);

  const countries = useMemo(
    () => [...new Set(rows.map((row) => row.country).filter(Boolean))].sort(),
    [rows]
  );

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const latitude = Number(row?.latitude);
        const longitude = Number(row?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
        if (country !== "all" && row.country !== country) return false;
        if (status !== "all" && (row.lead_status || "available") !== status) return false;
        if (Number(row.b2b_score || 0) < minimumScore) return false;
        return true;
      }),
    [rows, country, status, minimumScore]
  );

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection",
      features: filtered.map((row) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [Number(row.longitude), Number(row.latitude)],
        },
        properties: {
          lead_id: row.lead_id || "",
          name: row.name || "Unknown company",
          country: row.country || "",
          city: row.city || "",
          state: row.state || "",
          email: row.email || row.contact_emails?.[0] || "",
          website: row.website || "",
          b2b_score: Number(row.b2b_score || 0),
          lead_status: row.lead_status || "available",
          contact_count: Number(row.contact_count || 1),
        },
      })),
    }),
    [filtered]
  );

  const mappedCountries = new Set(filtered.map((row) => row.country).filter(Boolean)).size;
  const highPriority = filtered.filter((row) => Number(row.b2b_score || 0) >= 75).length;
  const unassigned = filtered.filter(
    (row) => (row.lead_status || "available") === "available"
  ).length;
  const collapsedContacts = Math.max(0, rawRows.length - rows.length);

  function onMapClick(event) {
    const feature = event.features?.find((row) => row?.layer?.id === "unclustered-point");
    if (!feature) return;
    setSelected({
      ...feature.properties,
      longitude: Number(feature.geometry?.coordinates?.[0] ?? event.lngLat.lng),
      latitude: Number(feature.geometry?.coordinates?.[1] ?? event.lngLat.lat),
    });
  }

  function selectFallbackRow(row) {
    setSelected({
      ...row,
      longitude: Number(row.longitude),
      latitude: Number(row.latitude),
      email: row.email || row.contact_emails?.[0] || "",
    });
  }

  const fallback = <GeographicFallback rows={filtered} onSelect={selectFallbackRow} />;

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <PageState loading={state.loading} error={state.error} label="Loading GIS lead portfolio…">
          <>
            <SectionHeader
              title="GIS opportunity map"
              subtitle="One map point per company/location; distinct contacts remain in the database without creating duplicate GIS pins."
            />

            <Grid container spacing={3}>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  <ComplexStatisticsCard
                    color="dark"
                    icon="location_on"
                    title="Company locations"
                    count={number(filtered.length)}
                    percentage={{
                      color: "dark",
                      amount: number(collapsedContacts),
                      label: "duplicate-location contact pins consolidated",
                    }}
                  />
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  <ComplexStatisticsCard
                    color="info"
                    icon="public"
                    title="Countries"
                    count={number(mappedCountries)}
                    percentage={{ color: "info", amount: "", label: "visible on current map" }}
                  />
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  <ComplexStatisticsCard
                    color="success"
                    icon="stars"
                    title="High-priority"
                    count={number(highPriority)}
                    percentage={{ color: "success", amount: "75+", label: "B2B score" }}
                  />
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  <ComplexStatisticsCard
                    color="primary"
                    icon="person_search"
                    title="Unassigned"
                    count={number(unassigned)}
                    percentage={{ color: "primary", amount: "", label: "available for claiming" }}
                  />
                </MDBox>
              </Grid>
            </Grid>

            <Card sx={{ mt: 4, overflow: "hidden" }}>
              <MDBox
                p={3}
                pb={2}
                display="flex"
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", lg: "center" }}
                flexDirection={{ xs: "column", lg: "row" }}
                gap={2}
              >
                <MDBox>
                  <MDTypography variant="h6">Interactive sales territory map</MDTypography>
                  <MDTypography variant="button" color="text">
                    Interactive territory map with clustering, lead popups and automatic
                    non-crashing fallback.
                  </MDTypography>
                </MDBox>
                <MDBox display="flex" flexWrap="wrap" gap={1}>
                  <Select
                    size="small"
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="all">All countries</MenuItem>
                    {countries.map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </Select>
                  <Select
                    size="small"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    sx={{ minWidth: 150 }}
                  >
                    <MenuItem value="all">All ownership</MenuItem>
                    <MenuItem value="available">Available</MenuItem>
                    <MenuItem value="claimed">Claimed</MenuItem>
                  </Select>
                  <Select
                    size="small"
                    value={minimumScore}
                    onChange={(event) => setMinimumScore(Number(event.target.value))}
                    sx={{ minWidth: 145 }}
                  >
                    <MenuItem value={0}>All scores</MenuItem>
                    <MenuItem value={50}>Score 50+</MenuItem>
                    <MenuItem value={75}>Score 75+</MenuItem>
                    <MenuItem value={90}>Score 90+</MenuItem>
                  </Select>
                </MDBox>
              </MDBox>

              {filtered.length ? (
                <>
                  {mapFailed ? (
                    fallback
                  ) : (
                    <MapRenderBoundary fallback={fallback}>
                      <MDBox height="650px">
                        <MapGL
                          initialViewState={{
                            longitude:
                              country === "Brazil" || countries.length === 1 ? -51.9253 : 5,
                            latitude: country === "Brazil" || countries.length === 1 ? -14.235 : 35,
                            zoom: country === "Brazil" || countries.length === 1 ? 3.2 : 1.5,
                          }}
                          mapStyle={
                            process.env.REACT_APP_MAP_STYLE_URL ||
                            "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
                          }
                          interactiveLayerIds={["unclustered-point"]}
                          onClick={onMapClick}
                          onError={(event) => {
                            // eslint-disable-next-line no-console
                            console.error(
                              "MapLibre GIS error; switching to fallback.",
                              event?.error || event
                            );
                            setMapFailed(true);
                          }}
                          reuseMaps
                        >
                          <Source
                            id="leads"
                            type="geojson"
                            data={geojson}
                            cluster
                            clusterMaxZoom={14}
                            clusterRadius={48}
                          >
                            <Layer {...clusterLayer} />
                            <Layer {...clusterCountLayer} />
                            <Layer {...pointLayer} />
                          </Source>

                          {selected ? (
                            <Popup
                              longitude={selected.longitude}
                              latitude={selected.latitude}
                              anchor="bottom"
                              onClose={() => setSelected(null)}
                              closeOnClick={false}
                            >
                              <MDBox minWidth="220px" p={0.5}>
                                <MDTypography variant="button" fontWeight="medium" display="block">
                                  {selected.name}
                                </MDTypography>
                                <MDTypography variant="caption" color="text" display="block">
                                  {[selected.city, selected.state, selected.country]
                                    .filter(Boolean)
                                    .join(", ")}
                                </MDTypography>
                                <MDBox my={1}>
                                  <MDBadge
                                    badgeContent={`score ${selected.b2b_score}`}
                                    color={Number(selected.b2b_score) >= 75 ? "success" : "info"}
                                    variant="gradient"
                                    size="sm"
                                  />
                                </MDBox>
                                {Number(selected.contact_count || 1) > 1 ? (
                                  <MDTypography variant="caption" display="block">
                                    {number(selected.contact_count)} contacts consolidated at this
                                    location
                                  </MDTypography>
                                ) : null}
                                {selected.email ? (
                                  <MDTypography variant="caption" display="block">
                                    {selected.email}
                                  </MDTypography>
                                ) : null}
                                {selected.website ? (
                                  <MDTypography
                                    component="a"
                                    href={safeUrl(selected.website)}
                                    target="_blank"
                                    rel="noreferrer"
                                    variant="caption"
                                    color="info"
                                  >
                                    Open website
                                  </MDTypography>
                                ) : null}
                              </MDBox>
                            </Popup>
                          ) : null}
                        </MapGL>
                      </MDBox>
                    </MapRenderBoundary>
                  )}

                  {mapFailed && selected ? (
                    <Box sx={{ px: 3, py: 2, borderTop: "1px solid #E6EBF3" }}>
                      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                        <Box>
                          <MDTypography variant="button" fontWeight="medium">
                            {selected.name}
                          </MDTypography>
                          <MDTypography variant="caption" color="text" display="block">
                            {[selected.city, selected.state, selected.country]
                              .filter(Boolean)
                              .join(", ")}
                          </MDTypography>
                        </Box>
                        <Box>
                          <MDTypography variant="caption" color="text" display="block">
                            Score {number(selected.b2b_score || 0)}
                          </MDTypography>
                          {selected.email ? (
                            <MDTypography variant="caption" color="text" display="block">
                              {selected.email}
                            </MDTypography>
                          ) : null}
                        </Box>
                      </Stack>
                    </Box>
                  ) : null}
                </>
              ) : (
                <Alert severity="warning" sx={{ m: 3 }}>
                  No geocoded leads match the selected filters.
                </Alert>
              )}
            </Card>
          </>
        </PageState>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}
