"use client";
import {
  Avatar,
  Autocomplete,
  Box,
  InputAdornment,
  TextField,
  Typography,
  createFilterOptions,
} from "@mui/material";
import { findThaiBank, thaiBanks, type ThaiBank } from "@/lib/thai-banks";

export function BankIcon({ name }: { name: string }) {
  const bank = findThaiBank(name);
  return (
    <Avatar
      component="span"
      aria-hidden
      sx={{
        width: 38,
        height: 38,
        flexShrink: 0,
        bgcolor: bank?.color || "#46515e",
        color: "#fff",
        fontWeight: 700,
        fontSize: bank && bank.short.length > 5 ? 8 : 10,
        borderRadius: 2,
      }}
    >
      {bank?.short || (
        <Box component="svg" viewBox="0 0 24 24" sx={{ width: 24, height: 24 }}>
          <path
            d="M3 9h18L12 3 3 9Zm2 2v8m7-8v8m7-8v8M3 21h18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </Box>
      )}
    </Avatar>
  );
}
export function BankName({ name }: { name: string }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1.5, minWidth: 0, verticalAlign: "middle" }}>
      <BankIcon name={name} />
      <Typography component="span" sx={{ overflowWrap: "anywhere" }}>
        {name}
      </Typography>
    </Box>
  );
}
const filterOptions = createFilterOptions<ThaiBank>({
  stringify: (b) => `${b.name} ${b.short} ${b.english} ${b.id}`,
});
export function BankSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
}) {
  const selected = findThaiBank(value) || null;
  return (
    <Autocomplete
      options={thaiBanks}
      value={selected}
      disabled={disabled}
      groupBy={(b) => b.group}
      getOptionLabel={(b) => b.name}
      filterOptions={filterOptions}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, bank) => onChange(bank?.name || "")}
      noOptionsText="ไม่พบธนาคาร ลองค้นด้วยชื่อภาษาไทยหรือชื่อย่อ"
      openText="เลือกรายการธนาคาร"
      closeText="ปิดรายการ"
      clearText="ล้างธนาคาร"
      renderOption={(props, bank) => {
        const { key, ...rest } = props;
        return (
          <Box component="li" key={key} {...rest} sx={{ gap: 1.5, py: 1.25 }}>
            <BankIcon name={bank.name} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ overflowWrap: "anywhere" }}>
                {bank.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {bank.short} · {bank.english}
              </Typography>
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="ธนาคาร"
          placeholder="ค้นหาชื่อธนาคาร หรือชื่อย่อ เช่น SCB"
          helperText="เลือกธนาคารให้ตรงกับบัญชีรับเงิน"
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: selected ? (
                <InputAdornment position="start">
                  <BankIcon name={selected.name} />
                </InputAdornment>
              ) : (
                params.slotProps.input.startAdornment
              ),
            },
            htmlInput: params.slotProps.htmlInput,
          }}
        />
      )}
    />
  );
}
