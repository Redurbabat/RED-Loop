"""Deterministic, dependency-free Xcode project. Run only when changing targets/files."""
from pathlib import Path
import hashlib, json, re

root = Path(__file__).resolve().parents[1] / 'ios'
objects = {}
def ident(name): return hashlib.sha1(name.encode()).hexdigest()[:24].upper()
def obj(key_name, isa, **props):
    key = ident(key_name); objects[key] = dict(isa=isa, **props); return key
def file(path, kind): return obj(path, 'PBXFileReference', lastKnownFileType=kind, path=path, sourceTree='<group>')
def build(ref): return obj('build:'+ref, 'PBXBuildFile', fileRef=ref)
def phase(name, kind, files): return obj(name,kind,buildActionMask=2147483647,files=[build(f) for f in files],runOnlyForDeploymentPostprocessing=0)
app_files=[file(str(path.relative_to(root)).replace('\\','/'),'sourcecode.swift') for path in sorted((root/'REDLoop').glob('*.swift'))]
ext_files=[file('REDLoopExtension/SafariWebExtensionHandler.swift','sourcecode.swift')]
test_files=[file(str(path.relative_to(root)).replace('\\','/'),'sourcecode.swift') for path in sorted((root/'REDLoopTests').glob('*.swift'))]
assets=file('REDLoop/Assets.xcassets','folder.assetcatalog')
resources=[file('REDLoopExtension/Resources/'+name,kind) for name,kind in [('manifest.json','text.json'),('red-loop.user.js','sourcecode.javascript'),('popup.html','text.html'),('popup.css','text.css'),('icon.png','image.png')]]
privacy=file('REDLoop/PrivacyInfo.xcprivacy','text.xml')
# Bundled fallback for the in-app ChatGPT view; npm run build keeps it in sync.
webview_script=file('REDLoop/Resources/red-loop-webview.js','sourcecode.javascript')
release_public_key=file('REDLoop/Resources/release-public.pem','text')
app_product=obj('app-product','PBXFileReference',explicitFileType='wrapper.application',path='REDLoop.app',sourceTree='BUILT_PRODUCTS_DIR')
ext_product=obj('ext-product','PBXFileReference',explicitFileType='wrapper.app-extension',path='REDLoopExtension.appex',sourceTree='BUILT_PRODUCTS_DIR')
test_product=obj('test-product','PBXFileReference',explicitFileType='wrapper.cfbundle',path='REDLoopTests.xctest',sourceTree='BUILT_PRODUCTS_DIR')
products=obj('products','PBXGroup',children=[app_product,ext_product,test_product],name='Products',sourceTree='<group>')
main=obj('main-group','PBXGroup',children=app_files+ext_files+test_files+[assets,privacy,webview_script,release_public_key]+resources+[products],sourceTree='<group>')
def configs(name, settings):
    configs=[]
    for mode in ['Debug','Release']:
        s=dict(settings)
        s.update(SWIFT_OPTIMIZATION_LEVEL='-Onone' if mode=='Debug' else '-O')
        if mode=='Debug': s.update(ENABLE_TESTABILITY='YES',DEBUG_INFORMATION_FORMAT='dwarf',SWIFT_ACTIVE_COMPILATION_CONDITIONS='DEBUG')
        else: s.update(DEBUG_INFORMATION_FORMAT='dwarf-with-dsym')
        configs.append(obj(name+mode,'XCBuildConfiguration',buildSettings=s,name=mode))
    return obj(name+'config-list','XCConfigurationList',buildConfigurations=configs,defaultConfigurationIsVisible=0,defaultConfigurationName='Release')
base=dict(SDKROOT='iphoneos',IPHONEOS_DEPLOYMENT_TARGET='17.0',SWIFT_VERSION='5.0',TARGETED_DEVICE_FAMILY='1,2',CLANG_ENABLE_MODULES='YES',CODE_SIGN_STYLE='Automatic',MARKETING_VERSION='0.5.0',CURRENT_PROJECT_VERSION='1',SWIFT_EMIT_LOC_STRINGS='YES')
project_config=configs('project',base)
app_config=configs('app',dict(PRODUCT_NAME='REDLoop',PRODUCT_BUNDLE_IDENTIFIER='com.bbtred.redloop',INFOPLIST_FILE='REDLoop/Info.plist',ASSETCATALOG_COMPILER_APPICON_NAME='AppIcon',ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME='AccentColor',LD_RUNPATH_SEARCH_PATHS=['$(inherited)','@executable_path/Frameworks']))
ext_config=configs('ext',dict(PRODUCT_NAME='REDLoopExtension',PRODUCT_BUNDLE_IDENTIFIER='com.bbtred.redloop.Extension',INFOPLIST_FILE='REDLoopExtension/Info.plist',APPLICATION_EXTENSION_API_ONLY='YES',SKIP_INSTALL='YES',LD_RUNPATH_SEARCH_PATHS=['$(inherited)','@executable_path/Frameworks','@executable_path/../../Frameworks']))
test_config=configs('test',dict(PRODUCT_NAME='REDLoopTests',PRODUCT_BUNDLE_IDENTIFIER='com.bbtred.redloop.Tests',GENERATE_INFOPLIST_FILE='YES',TEST_HOST='$(BUILT_PRODUCTS_DIR)/REDLoop.app/REDLoop',BUNDLE_LOADER='$(TEST_HOST)',LD_RUNPATH_SEARCH_PATHS=['$(inherited)','@executable_path/Frameworks','@loader_path/Frameworks']))
ext_target=obj('ext-target','PBXNativeTarget',buildConfigurationList=ext_config,buildPhases=[phase('ext-sources','PBXSourcesBuildPhase',ext_files),phase('ext-resources','PBXResourcesBuildPhase',resources+[privacy]),phase('ext-frameworks','PBXFrameworksBuildPhase',[])],buildRules=[],dependencies=[],name='REDLoopExtension',productName='REDLoopExtension',productReference=ext_product,productType='com.apple.product-type.app-extension')
def dependency(name,target):
    proxy=obj(name+'proxy','PBXContainerItemProxy',containerPortal=ident('project'),proxyType=1,remoteGlobalIDString=target,remoteInfo=name)
    return obj(name+'dependency','PBXTargetDependency',target=target,targetProxy=proxy)
embed_file=obj('embed-ext-file','PBXBuildFile',fileRef=ext_product,settings={'ATTRIBUTES':['RemoveHeadersOnCopy']})
embed=obj('embed-ext','PBXCopyFilesBuildPhase',buildActionMask=2147483647,dstPath='',dstSubfolderSpec=13,files=[embed_file],name='Embed App Extensions',runOnlyForDeploymentPostprocessing=0)
app_target=obj('app-target','PBXNativeTarget',buildConfigurationList=app_config,buildPhases=[phase('app-sources','PBXSourcesBuildPhase',app_files),phase('app-resources','PBXResourcesBuildPhase',[assets,privacy,webview_script,release_public_key]),phase('app-frameworks','PBXFrameworksBuildPhase',[]),embed],buildRules=[],dependencies=[dependency('REDLoopExtension',ext_target)],name='REDLoop',productName='REDLoop',productReference=app_product,productType='com.apple.product-type.application')
test_target=obj('test-target','PBXNativeTarget',buildConfigurationList=test_config,buildPhases=[phase('test-sources','PBXSourcesBuildPhase',test_files),phase('test-resources','PBXResourcesBuildPhase',[]),phase('test-frameworks','PBXFrameworksBuildPhase',[])],buildRules=[],dependencies=[dependency('REDLoop',app_target)],name='REDLoopTests',productName='REDLoopTests',productReference=test_product,productType='com.apple.product-type.bundle.unit-test')
project=obj('project','PBXProject',attributes={'BuildIndependentTargetsInParallel':'YES','LastUpgradeCheck':'1600','TargetAttributes':{test_target:{'TestTargetID':app_target}}},buildConfigurationList=project_config,compatibilityVersion='Xcode 14.0',developmentRegion='de',hasScannedForEncodings=0,knownRegions=['de','en','Base'],mainGroup=main,productRefGroup=products,projectDirPath='',projectRoot='',targets=[app_target,ext_target,test_target])
def serialize(value,depth=0):
    indent='\t'*depth
    if isinstance(value,dict): return '{\n'+''.join('\t'*(depth+1)+serialize(str(k))+' = '+serialize(v,depth+1)+';\n' for k,v in value.items())+indent+'}'
    if isinstance(value,list): return '(\n'+''.join('\t'*(depth+1)+serialize(v,depth+1)+',\n' for v in value)+indent+')'
    if isinstance(value,int): return str(value)
    return str(value) if re.fullmatch(r'[A-Za-z0-9_./]+',str(value)) else json.dumps(str(value))
project_dir=root/'REDLoop.xcodeproj'; project_dir.mkdir(exist_ok=True)
sections=[]
for isa in sorted({v['isa'] for v in objects.values()}):
    rows=''.join('\t\t'+key+' = '+serialize(value,2)+';\n' for key,value in objects.items() if value['isa']==isa)
    sections.append(f'/* Begin {isa} section */\n'+rows+f'/* End {isa} section */\n')
content='// !$*UTF8*$!\n{\n\tarchiveVersion = 1;\n\tclasses = {};\n\tobjectVersion = 56;\n\tobjects = {\n'+''.join(sections)+'\t};\n\trootObject = '+project+';\n}\n'
(project_dir/'project.pbxproj').write_text(content,encoding='utf-8')
scheme=f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{app_target}" BuildableName="REDLoop.app" BlueprintName="REDLoop" ReferencedContainer="container:REDLoop.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction>
<TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{test_target}" BuildableName="REDLoopTests.xctest" BlueprintName="REDLoopTests" ReferencedContainer="container:REDLoop.xcodeproj"/></TestableReference></Testables></TestAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{app_target}" BuildableName="REDLoop.app" BlueprintName="REDLoop" ReferencedContainer="container:REDLoop.xcodeproj"/></BuildableProductRunnable></LaunchAction>
<ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"/>
<AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>'''
scheme_dir=project_dir/'xcshareddata/xcschemes';scheme_dir.mkdir(parents=True,exist_ok=True)
(scheme_dir/'REDLoop.xcscheme').write_text(scheme,encoding='utf-8')
print('Generated REDLoop.xcodeproj and shared REDLoop scheme (3 targets).')
