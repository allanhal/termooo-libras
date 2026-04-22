import { Link } from "react-router-dom";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export default function Home() {
  return (
    <Stack
      spacing={3}
      sx={{
        minHeight: "100vh",
        p: 4,
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <Typography variant="h3">Termooo Libras</Typography>
      <Typography variant="body1" sx={{ maxWidth: 440 }}>
        Jogue a versão original ou experimente o novo detector de sinais (beta).
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Button
          variant="contained"
          size="large"
          component={Link}
          to="/termooo"
        >
          Jogar Termooo
        </Button>
        <Button
          variant="outlined"
          size="large"
          component={Link}
          to="/detect"
        >
          Detectar sinais (beta)
        </Button>
      </Stack>
      <Button
        size="small"
        component={Link}
        to="/admin"
        sx={{ color: "text.secondary", mt: 4 }}
      >
        admin
      </Button>
    </Stack>
  );
}
