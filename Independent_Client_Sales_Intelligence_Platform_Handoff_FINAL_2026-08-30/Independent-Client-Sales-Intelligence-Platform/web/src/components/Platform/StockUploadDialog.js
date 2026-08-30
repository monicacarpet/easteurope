/* eslint-disable react/prop-types */
import { useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Icon from "@mui/material/Icon";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import { importStockInventory } from "services/api";
import { parseStockUploadFile, sha256File } from "services/stockUpload";
import { number } from "lib/format";

function todayLocal() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function StockUploadDialog({ open, onClose, currentSnapshot, onImported }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [sha256, setSha256] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  function reset() {
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    setParsed(null);
    setSha256("");
    setConfirmReplace(false);
    setError("");
    setResult(null);
    setBusy(false);
    setDragging(false);
  }

  function close() {
    if (busy) return;
    reset();
    onClose?.();
  }

  async function loadFile(nextFile) {
    if (!nextFile) return;
    const extension = String(nextFile.name || "")
      .toLowerCase()
      .split(".")
      .pop();
    if (!["xlsx", "csv"].includes(extension)) {
      setFile(null);
      setParsed(null);
      setSha256("");
      setConfirmReplace(false);
      setResult(null);
      setError("Unsupported file type. Choose a .xlsx or .csv stock file.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setConfirmReplace(false);
    try {
      const [nextParsed, nextSha] = await Promise.all([
        parseStockUploadFile(nextFile),
        sha256File(nextFile),
      ]);
      setFile(nextFile);
      setParsed(nextParsed);
      setSha256(nextSha);
    } catch (loadError) {
      setFile(nextFile);
      setParsed(null);
      setSha256("");
      setError(loadError.message || "The stock file could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!parsed || parsed.errors.length || !confirmReplace) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await importStockInventory({
        fileName: parsed.fileName,
        sha256,
        effectiveDate,
        sheetName: parsed.sheetName,
        rows: parsed.rows,
        confirmLargeChange: confirmReplace,
      });
      setResult(response);
      await onImported?.(response);
      if (!response?.already_imported) {
        window.setTimeout(() => close(), 700);
      }
    } catch (submitError) {
      setError(
        submitError.message || "Stock import failed. The previous inventory remains active."
      );
    } finally {
      setBusy(false);
    }
  }

  const currentRows = Number(currentSnapshot?.row_count || 0);
  const currentArea = Number(currentSnapshot?.total_area_m2 || 0);
  const previewRows = parsed?.rows?.slice(0, 5) || [];

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          borderRadius: "16px",
          boxShadow: "0 24px 70px rgba(24, 39, 75, 0.18)",
          overflow: "hidden",
        },
      }}
    >
      <DialogTitle sx={{ px: { xs: 2.25, md: 3.5 }, py: 2.5, borderBottom: "1px solid #E8ECF2" }}>
        <MDBox display="flex" alignItems="flex-start" justifyContent="space-between" gap={2}>
          <MDBox>
            <MDTypography variant="h5" sx={{ color: "#20345B", letterSpacing: "-0.02em" }}>
              Upload current stock
            </MDTypography>
            <MDTypography display="block" variant="caption" color="text" mt={0.45}>
              Validate one complete inventory snapshot before replacing the active Supabase data.
            </MDTypography>
          </MDBox>
          <IconButton
            aria-label="Close stock upload"
            onClick={close}
            disabled={busy}
            size="small"
            sx={{ color: "#9AA5B5" }}
          >
            <Icon baseClassName="material-icons-outlined">close</Icon>
          </IconButton>
        </MDBox>
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 2.25, md: 3.5 }, py: "28px !important" }}>
        <MDBox display="grid" gap={2.5}>
          <Alert severity="info">
            Upload a complete stock snapshot. Excel, CSV and files created in WPS are supported when
            saved as .xlsx or .csv. Native WPS .et and legacy .xls files should be saved as .xlsx
            first.
          </Alert>

          <MDBox display="flex" gap={1} flexWrap="wrap">
            <MDButton
              component="a"
              href="/templates/Stock_Upload_Template.xlsx"
              color="dark"
              variant="outlined"
              size="small"
            >
              <Icon baseClassName="material-icons-outlined" sx={{ fontSize: "16px !important" }}>
                table_view
              </Icon>
              &nbsp; Excel / WPS template
            </MDButton>
            <MDButton
              component="a"
              href="/templates/Stock_Upload_Template.csv"
              color="dark"
              variant="outlined"
              size="small"
            >
              <Icon baseClassName="material-icons-outlined" sx={{ fontSize: "16px !important" }}>
                description
              </Icon>
              &nbsp; CSV template
            </MDButton>
          </MDBox>

          <Box
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              loadFile(event.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            sx={{
              border: `2px dashed ${dragging ? "#377DFF" : "#C9D3E1"}`,
              backgroundColor: dragging ? "#F2F7FF" : "#FBFCFE",
              borderRadius: "14px",
              px: { xs: 2.5, md: 5 },
              py: { xs: 4.5, md: 6 },
              cursor: "pointer",
              textAlign: "center",
              transition: "all .18s ease",
              "&:hover": { borderColor: "#377DFF", backgroundColor: "#F7FAFF" },
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              hidden
              onChange={(event) => loadFile(event.target.files?.[0])}
            />
            <MDBox
              mx="auto"
              mb={1.5}
              display="flex"
              alignItems="center"
              justifyContent="center"
              sx={{
                width: 52,
                height: 52,
                borderRadius: "14px",
                color: "#377DFF",
                backgroundColor: "#EAF2FF",
              }}
            >
              <Icon baseClassName="material-icons-outlined" sx={{ fontSize: "29px !important" }}>
                upload_file
              </Icon>
            </MDBox>
            <MDTypography
              variant="button"
              fontWeight="bold"
              display="block"
              sx={{ color: "#20345B", fontSize: "0.95rem" }}
            >
              {file ? file.name : "Drop your stock file here"}
            </MDTypography>
            <MDTypography display="block" variant="caption" color="text" mt={0.65} mb={2}>
              .xlsx or .csv only · WPS users should save as modern Excel
            </MDTypography>
            <MDButton
              variant="contained"
              onClick={(event) => {
                event.stopPropagation();
                inputRef.current?.click();
              }}
              sx={{
                color: "#fff !important",
                backgroundColor: "#377DFF !important",
                borderRadius: "8px",
                px: 3.2,
                py: 1.05,
                boxShadow: "none",
                textTransform: "none",
                "&:hover": { backgroundColor: "#528FFF !important", boxShadow: "none" },
              }}
            >
              {file ? "Choose another file" : "Choose stock file"}
            </MDButton>
          </Box>

          {busy ? <LinearProgress color="info" /> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {result?.message ? (
            <Alert severity={result.already_imported ? "info" : "success"}>{result.message}</Alert>
          ) : null}

          {parsed ? (
            <>
              <MDBox
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, minmax(0,1fr))" },
                  gap: 1.2,
                }}
              >
                {[
                  ["Rows", number(parsed.summary.rowCount)],
                  ["Total stock", `${number(parsed.summary.totalArea, 2)} m²`],
                  ["Export rows", number(parsed.summary.exportRowCount)],
                  ["Export stock", `${number(parsed.summary.exportArea, 2)} m²`],
                ].map(([label, value]) => (
                  <MDBox
                    key={label}
                    p={1.5}
                    sx={{
                      border: "1px solid #E3E8F0",
                      borderRadius: "10px",
                      backgroundColor: "#fff",
                    }}
                  >
                    <MDTypography variant="caption" color="text">
                      {label}
                    </MDTypography>
                    <MDTypography variant="button" display="block" fontWeight="bold" mt={0.25}>
                      {value}
                    </MDTypography>
                  </MDBox>
                ))}
              </MDBox>

              {parsed.errors.length ? (
                <Alert severity="error">
                  <strong>{parsed.errors.length} blocking validation issue(s).</strong>
                  <br />
                  {parsed.errors.slice(0, 6).join(" ")}
                  {parsed.errors.length > 6 ? " …" : ""}
                </Alert>
              ) : (
                <Alert severity="success">
                  File structure passed local validation. Supabase will run the authoritative
                  validation again before activation.
                </Alert>
              )}
              {parsed.warnings.length ? (
                <Alert severity="warning">
                  {parsed.warnings.slice(0, 4).join(" ")}
                  {parsed.warnings.length > 4 ? " …" : ""}
                </Alert>
              ) : null}

              <MDBox
                display="grid"
                gridTemplateColumns={{ xs: "1fr", sm: "220px 1fr" }}
                gap={1.5}
                alignItems="center"
              >
                <MDInput
                  type="date"
                  label="Stock effective date"
                  InputLabelProps={{ shrink: true }}
                  value={effectiveDate}
                  onChange={(event) => setEffectiveDate(event.target.value)}
                />
                <MDTypography variant="caption" color="text">
                  Current active snapshot:{" "}
                  {currentRows
                    ? `${number(currentRows)} rows · ${number(currentArea, 2)} m²`
                    : "not available"}
                  . The new snapshot activates only after the full database transaction succeeds.
                </MDTypography>
              </MDBox>

              <Divider />
              <MDBox sx={{ overflowX: "auto", border: "1px solid #E3E8F0", borderRadius: "10px" }}>
                <MDBox
                  px={1.5}
                  py={0.9}
                  sx={{
                    minWidth: 720,
                    display: "grid",
                    gridTemplateColumns: "70px 90px 120px 140px 1fr 110px",
                    gap: 1,
                    backgroundColor: "#F8FAFC",
                  }}
                >
                  {["ROW", "MARKET", "PROCESS", "SKU", "SPECIFICATION", "AREA"].map((label) => (
                    <MDTypography key={label} variant="caption" color="text" fontWeight="bold">
                      {label}
                    </MDTypography>
                  ))}
                </MDBox>
                {previewRows.map((row) => (
                  <MDBox
                    key={`${row.source_row}-${row.sku}`}
                    px={1.5}
                    py={0.9}
                    sx={{
                      minWidth: 720,
                      display: "grid",
                      gridTemplateColumns: "70px 90px 120px 140px 1fr 110px",
                      gap: 1,
                      borderTop: "1px solid #EDF0F4",
                    }}
                  >
                    <MDTypography variant="caption" color="text">
                      {row.source_row}
                    </MDTypography>
                    <MDTypography variant="caption" color="text">
                      {row.stock_market}
                    </MDTypography>
                    <MDTypography variant="caption" color="text">
                      {row.process_type}
                    </MDTypography>
                    <MDTypography variant="caption" color="text">
                      {row.sku}
                    </MDTypography>
                    <MDTypography variant="caption" color="text">
                      {row.specification}
                    </MDTypography>
                    <MDTypography variant="caption" color="text">
                      {number(row.area_m2, 2)} m²
                    </MDTypography>
                  </MDBox>
                ))}
              </MDBox>

              <MDBox
                sx={{
                  mt: 1,
                  p: 1.5,
                  borderRadius: "10px",
                  border: "1px solid #E3E8F0",
                  backgroundColor: "#FAFBFD",
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={confirmReplace}
                      onChange={(event) => setConfirmReplace(event.target.checked)}
                    />
                  }
                  label="I confirm this file is the complete current stock list and should replace the active inventory snapshot."
                />
              </MDBox>
            </>
          ) : null}
        </MDBox>
      </DialogContent>
      <DialogActions
        sx={{ px: { xs: 2.25, md: 3.5 }, py: 2.25, borderTop: "1px solid #E8ECF2", gap: 1 }}
      >
        <MDButton color="dark" variant="text" onClick={close} disabled={busy}>
          Cancel
        </MDButton>
        <MDButton
          variant="contained"
          disabled={
            busy || !parsed || Boolean(parsed?.errors?.length) || !confirmReplace || !effectiveDate
          }
          onClick={submit}
          sx={{
            color: "#fff !important",
            backgroundColor: "#377DFF !important",
            borderRadius: "8px",
            px: 3,
            boxShadow: "none",
            "&:hover": { backgroundColor: "#528FFF !important", boxShadow: "none" },
            "&.Mui-disabled": { backgroundColor: "#C8D6EE !important", color: "#fff !important" },
          }}
        >
          {busy ? "Validating…" : "Validate & activate stock"}
        </MDButton>
      </DialogActions>
    </Dialog>
  );
}
