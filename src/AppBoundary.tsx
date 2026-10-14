import {
  Alert,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Component, type ReactNode } from "react";

export class AppBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Container component="main" maxWidth="sm" sx={{ py: 8 }}>
        <Paper sx={{ p: 4 }}>
          <Stack spacing={2}>
            <Typography variant="overline">
              CLIMATRACE / HEATWAVE INTELLIGENCE
            </Typography>
            <Typography variant="h2">Unable to load the explorer</Typography>
            <Alert severity="error">{this.state.error.message}</Alert>
            <Button
              variant="contained"
              onClick={() => window.location.reload()}
            >
              Try again
            </Button>
          </Stack>
        </Paper>
      </Container>
    );
  }
}
