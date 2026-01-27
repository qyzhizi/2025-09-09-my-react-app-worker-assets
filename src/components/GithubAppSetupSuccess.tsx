import { type FC } from 'react';

const GithubAppSetupSuccess: FC = () => {
  return (
    <div className="w-full flex justify-center">    
      <div className="flex h-screen flex-col items-center gap-4" style={{ paddingTop: '25vh' }}>
        <div className="text-5xl mb-4 w-full text-center">ok!</div>
        <h2>The GitHub App was installed and configured successfully, you can now safely close this page!</h2>
      </div>
    </div>
  )
}

export default GithubAppSetupSuccess
