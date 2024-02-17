// absolute top-1 right-1
export function CustomCloseButton({ isInfo, onClick, ...props }) {
  // const twClasses = isInfo
  //   ? "absolute right-4 top-5 z-10"
  //   : "absolute right-4 z-10";
  // return (
  //   <IconButton
  //     {...props}
  //     icon={<i className="gg-close" />}
  //     color="text-runcoder-600 hover:text-white"
  //     bg="bg-transparent hover:bg-red-500"
  //     size="w-3 h-3"
  //     twClasses="ml-auto mr-1"
  //   />
  // );
  return <button onClick={onClick} className="gg-close" />;
}
