import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  TextField,
} from "@mui/material";
import type { Option } from "./types";

export function LocationPicker({
  label,
  value,
  options,
  onChange,
  disabled,
  loading,
  onSearch,
  more,
  onMore,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
  onSearch?: (q: string) => void;
  more?: boolean;
  onMore?: () => void;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Autocomplete
        options={options}
        value={options.find((o) => o.id === value) ?? null}
        getOptionLabel={(o) => o.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        getOptionKey={(o) => o.id}
        disabled={disabled}
        loading={loading}
        disableClearable={!!value}
        filterOptions={onSearch ? (items) => items : undefined}
        onInputChange={(_, input, reason) => {
          if (reason === "input" || reason === "clear") onSearch?.(input);
        }}
        onChange={(_, option) => {
          if (option) onChange(option.id);
          onSearch?.("");
        }}
        noOptionsText="No matches. Try the map picker."
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={`Select ${label.toLowerCase()}`}
            slotProps={{
              ...params.slotProps,
              input: {
                ...params.slotProps.input,
                endAdornment: (
                  <>
                    {loading && <CircularProgress size={16} />}{" "}
                    {params.slotProps.input.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />
      {more && (
        <Button size="small" onClick={onMore} disabled={loading}>
          Load more locations
        </Button>
      )}
    </Box>
  );
}
