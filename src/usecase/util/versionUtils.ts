export const getJavaMajorVersion = (version: string): number => {
  const v = version.replace(/^1\./, '');
  const match = v.match(/^(\d+)/);
  return match ? parseInt(match[1]) : 0;
};

export const isJavaCompatible = (version: string): boolean => {
  const major = getJavaMajorVersion(version);
  return major >= 17;
};
