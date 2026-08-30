/* eslint-disable react/prop-types */
import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Icon from "@mui/material/Icon";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import DataTable from "examples/Tables/DataTable";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";
import MDBadge from "components/MDBadge";
import PageState from "components/Platform/PageState";
import SectionHeader from "components/Platform/SectionHeader";
import LeadWorkspace from "components/Platform/LeadWorkspace";
import useAsyncData, { clearAsyncDataCache } from "hooks/useAsyncData";
import useSessionState from "hooks/useSessionState";
import { claimLead, getLeads, releaseLead } from "services/api";
import { dateTime, downloadCsv, number, safeUrl } from "lib/format";

export default function LeadTablePage({ mine }) {
  const stateKey = mine ? "platform-my-leads" : "platform-lead-database";
  const leadCacheKey = mine ? "platform-leads:mine" : "platform-leads:available";
  const state = useAsyncData(() => getLeads({ mine }), [mine], { cacheKey: leadCacheKey });
  const [search, setSearch] = useSessionState(`${stateKey}:search`, "");
  const [country, setCountry] = useSessionState(`${stateKey}:country`, "all");
  const [emailFilter, setEmailFilter] = useSessionState(`${stateKey}:email`, "all");
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const rows = state.data || [];
  const restrictedPool = !mine && rows.some((row) => row?._restricted_pool);
  const countries = useMemo(
    () => [...new Set(rows.map((row) => row.country).filter(Boolean))].sort(),
    [rows]
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (country !== "all" && row.country !== country) return false;
      if (!restrictedPool && emailFilter === "email" && !row.email) return false;
      if (
        !restrictedPool &&
        emailFilter === "verified" &&
        !(
          row.email_verified ||
          row.email_verification_status === "valid" ||
          row.email_confidence === "high"
        )
      )
        return false;
      const searchable = restrictedPool
        ? [row.name, row.country]
        : [
            row.name,
            row.city,
            row.state,
            row.country,
            row.email,
            row.contact_full_name,
            row.contact_job_title,
          ];
      if (
        needle &&
        !searchable.some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(needle)
        )
      )
        return false;
      return true;
    });
  }, [rows, search, country, emailFilter, restrictedPool]);

  async function changeOwnership(lead) {
    try {
      const result = mine ? await releaseLead(lead.lead_id) : await claimLead(lead.lead_id);
      setMessage(result?.message || (mine ? "Lead released." : "Lead claimed."));

      // Remove the ownership-changed row immediately from the current workspace.
      // Invalidate the opposite workspace so the next visit fetches the new ownership state.
      state.setData((currentRows) =>
        (currentRows || []).filter((row) => row.lead_id !== lead.lead_id)
      );
      clearAsyncDataCache(mine ? "platform-leads:available" : "platform-leads:mine");
    } catch (error) {
      setMessage(error.message);
    }
  }

  const table = useMemo(() => {
    if (restrictedPool) {
      return {
        columns: [
          { Header: "company", accessor: "company", width: "45%", align: "left" },
          { Header: "country", accessor: "country", width: "30%", align: "left" },
          { Header: "action", accessor: "action", align: "center" },
        ],
        rows: filtered.map((lead) => ({
          company: (
            <MDTypography display="block" variant="button" fontWeight="medium">
              {lead.name}
            </MDTypography>
          ),
          country: <MDTypography variant="caption">{lead.country || "—"}</MDTypography>,
          action: (
            <MDTypography
              component="button"
              type="button"
              variant="caption"
              color="success"
              fontWeight="medium"
              onClick={() => changeOwnership(lead)}
              sx={{ border: 0, background: "transparent", cursor: "pointer" }}
            >
              Claim to unlock
            </MDTypography>
          ),
        })),
      };
    }

    return {
      columns: [
        { Header: "company", accessor: "company", width: "28%", align: "left" },
        { Header: "location", accessor: "location", align: "left" },
        { Header: "decision contact", accessor: "contact", align: "left" },
        { Header: "email quality", accessor: "email", align: "center" },
        { Header: "score", accessor: "score", align: "center" },
        { Header: mine ? "claimed" : "status", accessor: "status", align: "center" },
        { Header: "action", accessor: "action", align: "center" },
      ],
      rows: filtered.map((lead) => ({
        company: (
          <MDBox lineHeight={1}>
            <MDTypography display="block" variant="button" fontWeight="medium">
              {lead.name}
            </MDTypography>
            <MDTypography
              component="a"
              href={safeUrl(lead.website)}
              target="_blank"
              rel="noreferrer"
              variant="caption"
              color="info"
            >
              {lead.company_domain || lead.website || "No website"}
            </MDTypography>
          </MDBox>
        ),
        location: (
          <MDBox lineHeight={1}>
            <MDTypography display="block" variant="caption" color="text" fontWeight="medium">
              {lead.city || "—"}, {lead.state || "—"}
            </MDTypography>
            <MDTypography variant="caption">{lead.country || lead.market || "—"}</MDTypography>
          </MDBox>
        ),
        contact: (
          <MDBox lineHeight={1}>
            <MDTypography display="block" variant="caption" color="text" fontWeight="medium">
              {lead.contact_full_name || "Not enriched"}
            </MDTypography>
            <MDTypography variant="caption">
              {lead.contact_job_title || lead.contact_department || "—"}
            </MDTypography>
          </MDBox>
        ),
        email: (
          <MDBox lineHeight={1} textAlign="center">
            <MDBadge
              badgeContent={
                lead.email
                  ? lead.email_verified || lead.email_confidence === "high"
                    ? "verified"
                    : "available"
                  : "missing"
              }
              color={lead.email ? "success" : "warning"}
              variant="gradient"
              size="sm"
            />
            <MDTypography display="block" variant="caption" mt={0.5}>
              {lead.email || "—"}
            </MDTypography>
          </MDBox>
        ),
        score: (
          <MDBadge
            badgeContent={number(lead.b2b_score || 0)}
            color={
              Number(lead.b2b_score || 0) >= 75
                ? "success"
                : Number(lead.b2b_score || 0) >= 50
                ? "info"
                : "dark"
            }
            variant="gradient"
            size="sm"
          />
        ),
        status: (
          <MDBox lineHeight={1} textAlign="center">
            <MDBadge
              badgeContent={mine ? "my lead" : lead.lead_status || "available"}
              color={mine ? "info" : lead.lead_status === "available" ? "success" : "dark"}
              variant="gradient"
              size="sm"
            />
            {mine ? (
              <MDTypography display="block" variant="caption" mt={0.5}>
                {dateTime(lead.assigned_at)}
              </MDTypography>
            ) : null}
          </MDBox>
        ),
        action: (
          <MDBox display="flex" flexDirection="column" gap={0.5} alignItems="center">
            <MDTypography
              component="button"
              type="button"
              variant="caption"
              color="info"
              fontWeight="medium"
              onClick={() => setSelected(lead)}
              sx={{ border: 0, background: "transparent", cursor: "pointer" }}
            >
              Open
            </MDTypography>
            <MDTypography
              component="button"
              type="button"
              variant="caption"
              color={mine ? "error" : "success"}
              fontWeight="medium"
              onClick={() => changeOwnership(lead)}
              sx={{ border: 0, background: "transparent", cursor: "pointer" }}
            >
              {mine ? "Release" : "Claim"}
            </MDTypography>
          </MDBox>
        ),
      })),
    };
  }, [filtered, mine, restrictedPool]);

  const withEmail = rows.filter((row) => row.email).length;
  const mapped = rows.filter((row) => row.latitude && row.longitude).length;
  const highScore = rows.filter((row) => Number(row.b2b_score || 0) >= 75).length;

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <PageState
          loading={state.loading}
          error={state.error}
          label={mine ? "Loading your lead portfolio…" : "Loading available leads…"}
        >
          <>
            <SectionHeader
              title={mine ? "My leads" : "Lead database"}
              subtitle={
                mine
                  ? "Owned accounts, notes, next actions and follow-up discipline."
                  : restrictedPool
                  ? "Only company name and country are visible. Claim a lead to unlock its contact details."
                  : "Search qualified companies, inspect contact quality and claim accounts atomically."
              }
              action={
                mine || !restrictedPool ? (
                  <MDButton
                    variant="outlined"
                    color="dark"
                    onClick={() =>
                      downloadCsv(mine ? "platform-my-leads.csv" : "platform-leads.csv", filtered)
                    }
                  >
                    <Icon
                      baseClassName="material-icons-outlined"
                      sx={{ fontSize: "17px !important" }}
                    >
                      download
                    </Icon>
                    &nbsp; export filtered
                  </MDButton>
                ) : null
              }
            />
            {message ? (
              <Alert
                severity={
                  message.toLowerCase().includes("fail") || message.toLowerCase().includes("error")
                    ? "error"
                    : "success"
                }
                sx={{ mb: 3 }}
                onClose={() => setMessage("")}
              >
                {message}
              </Alert>
            ) : null}
            <Grid container spacing={3}>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  <ComplexStatisticsCard
                    color="dark"
                    icon="business"
                    title={mine ? "Owned accounts" : "Visible leads"}
                    count={number(rows.length)}
                    percentage={{
                      color: "dark",
                      amount: number(countries.length),
                      label: "countries in current view",
                    }}
                  />
                </MDBox>
              </Grid>
              {restrictedPool ? (
                <Grid item xs={12} md={6} lg={3}>
                  <MDBox mb={1.5}>
                    <ComplexStatisticsCard
                      color="info"
                      icon="lock"
                      title="Contact details"
                      count="Locked"
                      percentage={{ color: "info", amount: "Claim", label: "to unlock one lead" }}
                    />
                  </MDBox>
                </Grid>
              ) : (
                <>
                  <Grid item xs={12} md={6} lg={3}>
                    <MDBox mb={1.5}>
                      <ComplexStatisticsCard
                        color="success"
                        icon="alternate_email"
                        title="Usable email"
                        count={number(withEmail)}
                        percentage={{
                          color: "success",
                          amount: rows.length
                            ? `${Math.round((withEmail / rows.length) * 100)}%`
                            : "0%",
                          label: "coverage",
                        }}
                      />
                    </MDBox>
                  </Grid>
                  <Grid item xs={12} md={6} lg={3}>
                    <MDBox mb={1.5}>
                      <ComplexStatisticsCard
                        color="info"
                        icon="map"
                        title="GIS ready"
                        count={number(mapped)}
                        percentage={{
                          color: "info",
                          amount: rows.length
                            ? `${Math.round((mapped / rows.length) * 100)}%`
                            : "0%",
                          label: "with coordinates",
                        }}
                      />
                    </MDBox>
                  </Grid>
                  <Grid item xs={12} md={6} lg={3}>
                    <MDBox mb={1.5}>
                      <ComplexStatisticsCard
                        color="primary"
                        icon="verified"
                        title="High-priority"
                        count={number(highScore)}
                        percentage={{
                          color: "primary",
                          amount: "75+",
                          label: "B2B score threshold",
                        }}
                      />
                    </MDBox>
                  </Grid>
                </>
              )}
            </Grid>
            <Card sx={{ mt: 4 }}>
              <MDBox
                p={3}
                pb={1}
                display="flex"
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", lg: "center" }}
                flexDirection={{ xs: "column", lg: "row" }}
                gap={2}
              >
                <MDBox>
                  <MDTypography variant="h6">
                    {mine ? "Owned account portfolio" : "Qualified lead inventory"}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {number(filtered.length)} records match the current filters
                  </MDTypography>
                </MDBox>
                <MDBox display="flex" flexWrap="wrap" gap={1}>
                  <MDInput
                    label={
                      restrictedPool ? "Search company or country" : "Search company or contact"
                    }
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <Select
                    size="small"
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    sx={{ minWidth: 155 }}
                  >
                    <MenuItem value="all">All countries</MenuItem>
                    {countries.map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </Select>
                  {!restrictedPool ? (
                    <Select
                      size="small"
                      value={emailFilter}
                      onChange={(event) => setEmailFilter(event.target.value)}
                      sx={{ minWidth: 155 }}
                    >
                      <MenuItem value="all">All email states</MenuItem>
                      <MenuItem value="email">Has email</MenuItem>
                      <MenuItem value="verified">Verified/high confidence</MenuItem>
                    </Select>
                  ) : null}
                </MDBox>
              </MDBox>
              <DataTable
                table={table}
                canSearch={false}
                entriesPerPage={{ defaultValue: 25, entries: [10, 25, 50, 100] }}
                showTotalEntries
                continuousPagination
                stateStorageKey={`${stateKey}:table`}
                pagination={{ variant: "gradient", color: "info" }}
              />
            </Card>
          </>
        </PageState>
      </MDBox>
      <LeadWorkspace lead={selected} open={Boolean(selected)} onClose={() => setSelected(null)} />
      <Footer />
    </DashboardLayout>
  );
}
