import PropTypes from "prop-types";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import ButtonBase from "@mui/material/ButtonBase";
import PlatformIcon from "components/Platform/PlatformIcon";
import Typography from "@mui/material/Typography";

const COLORS = {
  active: "#191b20",
  text: "#657086",
  border: "#dfe4eb",
};

function pageWindow(pageCount, pageIndex) {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index);
  const start = Math.min(Math.max(pageIndex - 2, 0), pageCount - 5);
  return Array.from({ length: 5 }, (_, offset) => start + offset);
}

export default function ContinuousPagination({
  pageCount,
  pageIndex,
  gotoPage,
  previousPage,
  nextPage,
  canPreviousPage,
  canNextPage,
}) {
  if (pageCount <= 1) return null;
  const pages = pageWindow(pageCount, pageIndex);
  const controlSx = {
    width: { xs: 38, sm: 44 },
    height: { xs: 38, sm: 44 },
    border: `1px solid ${COLORS.border}`,
    borderRadius: "7px",
    color: COLORS.text,
    backgroundColor: "#fff",
    boxShadow: "0 3px 9px rgba(25,35,55,0.08)",
    transition: "transform 140ms ease, box-shadow 140ms ease",
    "&:hover": {
      transform: "translateY(-2px)",
      boxShadow: "0 5px 12px rgba(25,35,55,0.11)",
      backgroundColor: "#fff",
    },
    "&.Mui-disabled": { opacity: 0.35 },
  };

  return (
    <Box display="flex" alignItems="center" justifyContent="center" gap={{ xs: 0.7, sm: 1 }}>
      <IconButton
        disabled={!canPreviousPage}
        onClick={previousPage}
        sx={controlSx}
        aria-label="Previous page"
      >
        <PlatformIcon name="chevron_left" size={18} />
      </IconButton>

      {pages[0] > 0 ? (
        <>
          <ButtonBase onClick={() => gotoPage(0)} sx={controlSx}>
            <Typography fontWeight={600}>1</Typography>
          </ButtonBase>
          {pages[0] > 1 ? <Typography sx={{ color: COLORS.text, px: 0.2 }}>…</Typography> : null}
        </>
      ) : null}

      {pages.map((page) => {
        const active = page === pageIndex;
        return (
          <ButtonBase
            key={page}
            onClick={() => gotoPage(page)}
            sx={{
              ...controlSx,
              color: active ? "#fff" : COLORS.text,
              background: active ? COLORS.active : "#fff",
              borderColor: active ? COLORS.active : COLORS.border,
              boxShadow: active ? "0 5px 12px rgba(10,14,24,0.22)" : controlSx.boxShadow,
              "&:hover": {
                transform: active ? "none" : "translateY(-2px)",
                background: active ? COLORS.active : "#fff",
                boxShadow: active
                  ? "0 5px 12px rgba(10,14,24,0.22)"
                  : "0 5px 12px rgba(25,35,55,0.11)",
              },
            }}
          >
            <Typography sx={{ fontSize: 15, fontWeight: 650, color: "inherit" }}>
              {page + 1}
            </Typography>
          </ButtonBase>
        );
      })}

      {pages[pages.length - 1] < pageCount - 1 ? (
        <>
          {pages[pages.length - 1] < pageCount - 2 ? (
            <Typography sx={{ color: COLORS.text, px: 0.2 }}>…</Typography>
          ) : null}
          <ButtonBase onClick={() => gotoPage(pageCount - 1)} sx={controlSx}>
            <Typography fontWeight={600}>{pageCount}</Typography>
          </ButtonBase>
        </>
      ) : null}

      <IconButton disabled={!canNextPage} onClick={nextPage} sx={controlSx} aria-label="Next page">
        <PlatformIcon name="chevron_right" size={18} />
      </IconButton>
    </Box>
  );
}

ContinuousPagination.propTypes = {
  pageCount: PropTypes.number.isRequired,
  pageIndex: PropTypes.number.isRequired,
  gotoPage: PropTypes.func.isRequired,
  previousPage: PropTypes.func.isRequired,
  nextPage: PropTypes.func.isRequired,
  canPreviousPage: PropTypes.bool.isRequired,
  canNextPage: PropTypes.bool.isRequired,
};
