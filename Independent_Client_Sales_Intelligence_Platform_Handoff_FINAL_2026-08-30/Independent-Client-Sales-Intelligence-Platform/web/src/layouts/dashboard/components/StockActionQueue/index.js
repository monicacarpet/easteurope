import PropTypes from "prop-types";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import { number } from "lib/format";
import platformTokens from "assets/theme/platformTokens";

const headerCell = {
  py: 1.1,
  px: 1.5,
  borderBottom: `1px solid ${platformTokens.surface.border}`,
  color: platformTokens.text.tertiary,
  fontSize: "0.61rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const bodyCell = {
  py: 1.2,
  px: 1.5,
  borderBottom: `1px solid ${platformTokens.surface.border}`,
  color: platformTokens.text.secondary,
  fontSize: "0.69rem",
};

export default function StockActionQueue({ rows }) {
  const visible = rows.slice(0, 6);
  const maxArea = Math.max(1, ...visible.map((row) => Number(row.stock_area_m2 || 0)));

  return (
    <Card
      sx={{
        height: "100%",
        border: `1px solid ${platformTokens.surface.border}`,
        borderRadius: "16px",
        boxShadow: "0 3px 14px rgba(16, 24, 40, 0.035)",
        overflow: "hidden",
      }}
    >
      <Box sx={{ px: 2.25, pt: 2.1, pb: 1.4 }}>
        <Typography
          sx={{ color: platformTokens.text.primary, fontWeight: 700, fontSize: "0.9rem" }}
        >
          Stock promotion action queue
        </Typography>
        <Typography
          variant="caption"
          sx={{
            mt: 0.35,
            display: "block",
            color: platformTokens.text.tertiary,
            fontSize: "0.69rem",
          }}
        >
          Largest promotion-ready groups with the weakest campaign exposure
        </Typography>
      </Box>

      <TableContainer>
        <Table size="small">
          <TableHead sx={{ display: "table-header-group" }}>
            <TableRow>
              <TableCell sx={headerCell}>Product group</TableCell>
              <TableCell sx={headerCell} align="right">
                Area
              </TableCell>
              <TableCell sx={headerCell} align="right">
                Lots
              </TableCell>
              <TableCell sx={headerCell} align="right">
                Emails
              </TableCell>
              <TableCell sx={{ ...headerCell, width: 120 }}>Exposure</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((row) => {
              const area = Number(row.stock_area_m2 || 0);
              const emails = Number(row.emails_sent || 0);
              const exposure = Math.max(5, Math.min(100, (area / maxArea) * 100));

              return (
                <TableRow key={row.product_group || `row-${area}`}>
                  <TableCell sx={bodyCell}>
                    <Typography
                      sx={{
                        color: platformTokens.text.primary,
                        fontSize: "0.71rem",
                        fontWeight: 650,
                      }}
                    >
                      {row.product_group || "Other"}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: platformTokens.text.tertiary, fontSize: "0.61rem" }}
                    >
                      priority {number(row.priority_score || 0, 0)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={bodyCell} align="right">
                    {number(area, 0)} m²
                  </TableCell>
                  <TableCell sx={bodyCell} align="right">
                    {number(row.stock_items || 0)}
                  </TableCell>
                  <TableCell sx={bodyCell} align="right">
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        minWidth: 24,
                        justifyContent: "center",
                        px: 0.7,
                        py: 0.25,
                        borderRadius: "6px",
                        backgroundColor: emails ? "#F0F8F4" : "#FFF1F1",
                        color: emails
                          ? platformTokens.status.success
                          : platformTokens.status.danger,
                        fontWeight: 700,
                        fontSize: "0.64rem",
                      }}
                    >
                      {number(emails)}
                    </Box>
                  </TableCell>
                  <TableCell sx={bodyCell}>
                    <Box
                      sx={{
                        height: 6,
                        width: "100%",
                        borderRadius: 999,
                        overflow: "hidden",
                        backgroundColor: "#EEF1F6",
                      }}
                    >
                      <Box
                        sx={{
                          height: "100%",
                          width: `${exposure}%`,
                          borderRadius: 999,
                          backgroundColor: emails
                            ? platformTokens.chart.primary
                            : platformTokens.status.warning,
                        }}
                      />
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}

            {!visible.length ? (
              <TableRow>
                <TableCell sx={{ ...bodyCell, py: 3 }} colSpan={5} align="center">
                  No promotion-ready stock groups available.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

StockActionQueue.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
};
