import Button from "utils/atoms/buttons/Button";

export default function ExportSelectedButton({ buttonText }) {
  return <Button onClick={convertAndOpen}>{buttonText}</Button>;
}
