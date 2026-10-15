import SettingsCategoryPage from '../../SettingsCategoryPage';
export default async function Page({params}){const {section}=await params;return <SettingsCategoryPage category="live-editors" section={section}/>;}
