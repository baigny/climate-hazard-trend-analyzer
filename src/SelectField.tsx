import { Autocomplete, TextField } from "@mui/material";

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  error = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: string) => void;
  error?: boolean;
}) {
  return (
    <Autocomplete<{ value: T; label: string }, false, true, false>
      options={options}
      value={options.find((option) => option.value === value)}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, selected) => option.value === selected.value}
      disableClearable
      selectOnFocus
      blurOnSelect
      onChange={(_, option) => {
        if (option) onChange(String(option.value));
      }}
      slotProps={{
        popper: { placement: "bottom-start" },
      }}
      renderInput={(params) => (
        <TextField {...params} label={label} error={error} />
      )}
      sx={{ minWidth: 0, flex: 1 }}
    />
  );
}
